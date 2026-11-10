import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as I from "../icons";
import { canUpdate, checkForUpdate, installUpdate, type Check, type Release } from "../lib/updater";

type State =
  | { k: "idle" }
  | { k: "checking" }
  | { k: "result"; c: Check }
  | { k: "error"; msg: string }
  | { k: "downloading"; f: number }
  | { k: "permission"; url: string };

interface Api {
  /** A release newer than the installed app, once the check has found one. */
  newer: Release | null;
  /** Opens the update sheet and checks again. */
  open(): void;
}

const Ctx = createContext<Api>({ newer: null, open: () => {} });
export const useUpdate = () => useContext(Ctx);

const LATER = "waraqa-update-later";
const newerOf = (c: Check) => (c.latest && c.latest.build > c.current.build ? c.latest : null);

/**
 * One update check for the whole app. When the app opens and a newer version is out,
 * the sheet opens by itself once per version; "Later" closes it until the next one.
 * The Home strip and the Me button stay until the update is installed.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  const [st, setSt] = useState<State>({ k: "idle" });
  const [newer, setNewer] = useState<Release | null>(null);

  useEffect(() => {
    if (!canUpdate()) return;
    checkForUpdate()
      .then((c) => {
        const n = newerOf(c);
        setNewer(n);
        let skipped = "";
        try { skipped = localStorage.getItem(LATER) ?? ""; } catch { /* ignore */ }
        if (n && skipped !== n.name) { setSt({ k: "result", c }); setShow(true); }
      })
      .catch(() => {});
  }, []);

  const check = useCallback(async () => {
    setShow(true);
    setSt({ k: "checking" });
    try {
      const c = await checkForUpdate();
      setNewer(newerOf(c));
      setSt({ k: "result", c });
    } catch (e) {
      setSt({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const install = async (url: string) => {
    setSt({ k: "downloading", f: 0 });
    try {
      const r = await installUpdate(url, (f) => setSt({ k: "downloading", f }));
      if (r === "needs-permission") setSt({ k: "permission", url });
      else setSt({ k: "idle" }), setShow(false);
    } catch (e) {
      setSt({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const later = () => {
    if (newer) try { localStorage.setItem(LATER, newer.name); } catch { /* ignore */ }
    setShow(false);
  };

  const found = st.k === "result" ? newerOf(st.c) : null;
  const api = useMemo(() => ({ newer, open: check }), [newer, check]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {show && (
        <div className="scrim" onClick={() => st.k !== "downloading" && later()}>
          <div className="sheet-panel update-sheet" role="dialog" aria-modal="true" aria-label="App update" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>{found ? `Version ${found.name} is ready` : "Updates"}</h2>
              {st.k !== "downloading" && (
                <button className="icon-btn" onClick={later} aria-label="Close"><I.Close /></button>
              )}
            </div>
            {st.k === "checking" && <p className="muted">Checking for a newer version…</p>}
            {st.k === "error" && (
              <>
                <p className="muted">The update check did not work. Check your internet and try again.</p>
                <p className="muted mono small">{st.msg}</p>
                <button className="btn btn-primary wide" onClick={check}>Try again</button>
              </>
            )}
            {st.k === "result" && !found && (
              <p className="muted">
                You have the newest version{st.c.current.name ? ` (${st.c.current.name})` : ""}.
                {!st.c.latest && " No version has been published yet."}
              </p>
            )}
            {found && st.k === "result" && (
              <>
                <p className="muted">You have {st.c.current.name}. Your scans stay on the phone when you update.</p>
                {found.notes && <p className="small update-notes">{found.notes}</p>}
                <button className="btn btn-primary wide" onClick={() => install(found.apkUrl)}><I.Download /> Download and install</button>
                <button className="btn btn-quiet wide" onClick={later}>Later</button>
              </>
            )}
            {st.k === "downloading" && (
              <div className="progress" aria-live="polite">
                <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(st.f * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.round(st.f * 100)}%` }} /></div>
                <span className="muted">Downloading {Math.round(st.f * 100)}%. Android will ask you to install it.</span>
              </div>
            )}
            {st.k === "permission" && (
              <>
                <p className="muted">Android needs your OK once to install updates from Waraqa. Turn on “Allow from this source”, come back, and tap below.</p>
                <button className="btn btn-primary wide" onClick={() => install(st.url)}><I.Download /> Download and install</button>
              </>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** The arrows in a top bar, with a dot when an update is waiting. */
export function UpdateIcon() {
  const { newer, open } = useUpdate();
  if (!canUpdate()) return null;
  return (
    <button className="icon-btn update-btn" onClick={open} aria-label={newer ? `Update to version ${newer.name}` : "Check for updates"}>
      <I.Refresh />
      {newer && <span className="update-dot" aria-hidden="true" />}
    </button>
  );
}

/** A strip at the top of Home, shown only while a newer version is waiting. */
export function UpdateBanner() {
  const { newer, open } = useUpdate();
  if (!canUpdate() || !newer) return null;
  return (
    <button className="update-banner" onClick={open}>
      <span className="update-ic"><I.Download /></span>
      <span className="update-txt"><b>Version {newer.name} is ready</b><small>Your scans stay on the phone</small></span>
      <span className="update-go">Update</span>
    </button>
  );
}

/** The full button on the Me tab. */
export function UpdateRow() {
  const { newer, open } = useUpdate();
  if (!canUpdate()) return <p className="muted small">This is the web view. It always opens the newest version.</p>;
  return (
    <button className={"btn wide " + (newer ? "btn-primary" : "btn-quiet")} onClick={open}>
      <I.Refresh /> {newer ? `Update to ${newer.name}` : "Check for updates"}
    </button>
  );
}
