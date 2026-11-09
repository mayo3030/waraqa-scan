import { useCallback, useEffect, useRef, useState } from "react";
import { CropScreen } from "./screens/Crop";
import { FilterScreen } from "./screens/Filter";
import { Home } from "./screens/Home";
import { DocView } from "./screens/DocView";
import { blobToRaster } from "./lib/io";
import { detectAsync } from "./lib/engine";
import { fullQuad, type Quad, type Raster } from "./lib/geometry";
import { getPage, type PageRec } from "./lib/store";
import { NO_ADJUST, type Adjust, type FilterKind } from "./lib/filters";
import { seedSample } from "./lib/sample";
import { yieldToPaint } from "./lib/timeout";

export interface Session {
  docId?: string; // add to this document (new one when missing)
  page?: PageRec; // re-editing this page
  queue: Blob[]; // photos still waiting after this one
  original: Blob;
  src: Raster;
  quad: Quad;
  autoFound: boolean;
  rotation: number;
  filter: FilterKind;
  adjust: Adjust;
}

type Route =
  | { name: "home" }
  | { name: "doc"; id: string }
  | { name: "crop"; s: Session }
  | { name: "filter"; s: Session };

export interface Toast { text: string; tone?: "error" }

export function App() {
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rev, setRev] = useState(0);
  const toastTimer = useRef<number>();

  const notify = useCallback((t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const [fatal, setFatal] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setFatal(e.message || "Unknown error");
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      setFatal(r instanceof Error ? r.message : String(r));
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

  useEffect(() => {
    // The example page is built off the UI thread. OpenCV is not loaded here:
    // starting it on the page that just opened freezes the phone.
    seedSample().then((made) => made && setRev((r) => r + 1)).catch(() => {});
  }, []);

  const openPhoto = useCallback(
    async (blobs: Blob[], docId?: string, page?: PageRec) => {
      if (!blobs.length) return;
      setBusy("Finding the page edges");
      await yieldToPaint();
      try {
        const [first, ...queue] = blobs;
        const src = await blobToRaster(first);
        let quad: Quad = fullQuad(src.width, src.height, 0.04);
        let autoFound = false;
        if (page) {
          quad = page.quad;
          autoFound = true;
        } else {
          try {
            const d = await detectAsync(src);
            quad = d.quad;
            autoFound = d.found;
          } catch {
            notify({ text: "Automatic edges are not available, drag the corners yourself", tone: "error" });
          }
        }
        setRoute({
          name: "crop",
          s: {
            docId, page, queue, original: first, src, quad, autoFound,
            rotation: page?.rotation ?? 0,
            filter: page?.filter ?? "enhance",
            adjust: page?.adjust ?? NO_ADJUST,
          },
        });
      } catch {
        notify({ text: "That file could not be opened as a photo", tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );

  const editPage = useCallback(
    async (docId: string, pageId: string) => {
      const p = await getPage(pageId);
      if (p) openPhoto([p.original], docId, p);
    },
    [openPhoto],
  );

  const afterSave = useCallback(
    (s: Session, docId: string) => {
      setRev((r) => r + 1);
      if (s.queue.length) {
        notify({ text: `Page saved. ${s.queue.length} more to go` });
        openPhoto(s.queue, docId);
      } else {
        notify({ text: s.page ? "Page updated" : "Page saved" });
        setRoute({ name: "doc", id: docId });
      }
    },
    [notify, openPhoto],
  );

  const backFromSession = (s: Session) =>
    setRoute(s.docId ? { name: "doc", id: s.docId } : { name: "home" });

  return (
    <div className="app">
      {route.name === "home" && (
        <Home rev={rev} onOpen={(id) => setRoute({ name: "doc", id })} onPhotos={(b) => openPhoto(b)} />
      )}
      {route.name === "doc" && (
        <DocView
          id={route.id}
          rev={rev}
          notify={notify}
          onBack={() => setRoute({ name: "home" })}
          onPhotos={(b) => openPhoto(b, route.id)}
          onEditPage={(pid) => editPage(route.id, pid)}
          onChanged={() => setRev((r) => r + 1)}
        />
      )}
      {route.name === "crop" && (
        <CropScreen
          s={route.s}
          onCancel={() => backFromSession(route.s)}
          onNext={(s) => setRoute({ name: "filter", s })}
        />
      )}
      {route.name === "filter" && (
        <FilterScreen
          s={route.s}
          notify={notify}
          onBack={(s) => setRoute({ name: "crop", s })}
          onSaved={afterSave}
        />
      )}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div className="busy-card"><span className="spinner" />{busy}</div>
        </div>
      )}
      {fatal && (
        <div className="fatal" role="alert">
          <b>Something went wrong</b>
          {fatal}
          <div><button onClick={() => setFatal(null)}>Dismiss</button></div>
        </div>
      )}
      {toast && (
        <div className={"toast" + (toast.tone === "error" ? " toast-error" : "")} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
