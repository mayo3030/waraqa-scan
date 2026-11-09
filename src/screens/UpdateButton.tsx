import { useEffect, useState } from "react";
import * as I from "../icons";
import { canUpdate, checkForUpdate, installUpdate, type Check } from "../lib/updater";

type State =
  | { k: "idle" }
  | { k: "checking" }
  | { k: "result"; c: Check }
  | { k: "error"; msg: string }
  | { k: "downloading"; f: number }
  | { k: "permission"; url: string };

// "Check for updates" in the top bar of the Android app.
export function UpdateButton() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<State>({ k: "idle" });
  const [dot, setDot] = useState(false);

  // Quiet check when the app opens, so the button can show a dot.
  useEffect(() => {
    if (!canUpdate()) return;
    checkForUpdate()
      .then((c) => setDot(!!c.latest && c.latest.build > c.current.build))
      .catch(() => {});
  }, []);

  if (!canUpdate()) return null;

  const check = async () => {
    setOpen(true);
    setSt({ k: "checking" });
    try {
      const c = await checkForUpdate();
      setDot(!!c.latest && c.latest.build > c.current.build);
      setSt({ k: "result", c });
    } catch (e) {
      setSt({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const install = async (url: string) => {
    setSt({ k: "downloading", f: 0 });
    try {
      const r = await installUpdate(url, (f) => setSt({ k: "downloading", f }));
      if (r === "needs-permission") setSt({ k: "permission", url });
      else setOpen(false);
    } catch (e) {
      setSt({ k: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const newer = st.k === "result" && st.c.latest && st.c.latest.build > st.c.current.build ? st.c.latest : null;

  return (
    <>
      <button className="icon-btn update-btn" onClick={check} aria-label="Check for updates">
        <I.Refresh />
        {dot && <span className="update-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="scrim" onClick={() => st.k !== "downloading" && setOpen(false)}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>{newer ? `Version ${newer.name} is ready` : "Updates"}</h2>
              {st.k !== "downloading" && (
                <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
              )}
            </div>
            {st.k === "checking" && <p className="muted">Checking for a newer version…</p>}
            {st.k === "error" && (
              <>
                <p className="muted">The update check did not work. Check your internet and try again.</p>
                <p className="muted mono small">{st.msg}</p>
                <button className="btn" onClick={check}>Try again</button>
              </>
            )}
            {st.k === "result" && !newer && (
              <p className="muted">
                You have the newest version{st.c.current.name ? ` (${st.c.current.name})` : ""}.
                {!st.c.latest && " No version has been published yet."}
              </p>
            )}
            {newer && (
              <>
                <p className="muted">You have {st.k === "result" ? st.c.current.name : ""}. Your scans stay on the phone when you update.</p>
                {newer.notes && <p className="small update-notes">{newer.notes}</p>}
                <button className="btn btn-primary" onClick={() => install(newer.apkUrl)}>Download and install</button>
              </>
            )}
            {st.k === "downloading" && (
              <div className="progress" aria-live="polite">
                <div className="progress-bar"><span style={{ width: `${Math.round(st.f * 100)}%` }} /></div>
                <span className="muted">Downloading {Math.round(st.f * 100)}%. Android will ask you to install it.</span>
              </div>
            )}
            {st.k === "permission" && (
              <>
                <p className="muted">Android needs your OK once to install updates from Waraqa. Turn on “Allow from this source”, come back, and tap below.</p>
                <button className="btn btn-primary" onClick={() => install(st.url)}>Download and install</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
