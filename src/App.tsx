import { useCallback, useEffect, useRef, useState } from "react";
import * as I from "./icons";
import { CropScreen } from "./screens/Crop";
import { FilterScreen } from "./screens/Filter";
import { Home } from "./screens/Home";
import { DocView, type DocTool } from "./screens/DocView";
import { Documents } from "./screens/Documents";
import { Tools, type FileTool } from "./screens/Tools";
import { Settings } from "./screens/Settings";
import { CameraScreen, type Shots } from "./screens/Camera";
import { IdPhotoScreen } from "./screens/IdPhoto";
import { SignScreen } from "./screens/Sign";
import { EraseScreen } from "./screens/Erase";
import { CountScreen } from "./screens/Count";
import { GreetingScreen } from "./screens/Greeting";
import { quickSave } from "./lib/quicksave";
import { lockOrientation } from "./lib/device";
import { useDocs } from "./screens/useDocs";
import { blobToRaster, rasterToBlob } from "./lib/io";
import { detectAsync, runAsync } from "./lib/engine";
import { fullQuad, type Quad, type Raster } from "./lib/geometry";
import { addPages, getDoc, getPage, getPages, newDoc, type PageRec } from "./lib/store";
import { NO_ADJUST, type Adjust, type FilterKind } from "./lib/filters";
import { seedSample } from "./lib/sample";
import { yieldToPaint } from "./lib/timeout";
import { modeInfo, postProcess, type Mode, type ModeOpts } from "./lib/modes";
import { readPrefs, usePrefs } from "./lib/prefs";
import { pageFromRaster } from "./lib/pagemake";
import { isPdf, pdfToRasters } from "./lib/pdfimport";
import { buildPdf } from "./lib/pdf";
import { safeName, saveFile, saveMany, shareNative } from "./lib/save";
import { Capacitor } from "@capacitor/core";

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
  mode?: Mode; // camera mode the photos came from
  hd?: boolean;
  stamps?: string[][]; // timestamp lines, one per photo of the session
  fresh?: string[]; // ids of pages saved so far in this session
  opts?: ModeOpts; // choices made on the camera
}

type Tab = "home" | "docs" | "tools" | "me";
type Route =
  | { name: "tab"; tab: Tab }
  | { name: "doc"; id: string; tool?: DocTool }
  | { name: "camera"; mode: Mode; docId?: string }
  | { name: "crop"; s: Session }
  | { name: "filter"; s: Session }
  | { name: "idphoto"; photo: Raster }
  | { name: "count"; photo: Raster }
  | { name: "greeting"; photo: Raster }
  | { name: "sign"; docId: string; page: PageRec; label: string }
  | { name: "erase"; docId: string; page: PageRec; label: string };

export interface Toast { text: string; tone?: "error" }

interface Extra { mode?: Mode; stamps?: string[][]; fresh?: string[]; opts?: ModeOpts }

export function App() {
  const [route, setRoute] = useState<Route>(() => (readPrefs().startCamera ? { name: "camera", mode: "scan" } : { name: "tab", tab: "home" }));
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rev, setRev] = useState(0);
  const [prefs, setPrefs] = usePrefs();
  const [pickFor, setPickFor] = useState<DocTool | null>(null);
  const toastTimer = useRef<number>();
  const lastTab = useRef<Tab>("home");
  if (route.name === "tab") lastTab.current = route.tab;
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const notify = useCallback((t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => { void lockOrientation(prefs.orientation); }, [prefs.orientation]);

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
    seedSample().then((made) => made && bump()).catch(() => {});
  }, [bump]);

  const home = () => setRoute({ name: "tab", tab: lastTab.current });
  const openDoc = (id: string, tool?: DocTool) => setRoute({ name: "doc", id, tool });

  const openPhoto = useCallback(
    async (blobs: Blob[], docId?: string, page?: PageRec, extra: Extra = {}) => {
      if (!blobs.length) return;
      setBusy("Finding the page edges");
      await yieldToPaint();
      try {
        const [first, ...queue] = blobs;
        const src = await blobToRaster(first, prefs.hd ? 3600 : 2400);
        let quad: Quad = fullQuad(src.width, src.height, 0.04);
        let autoFound = false;
        if (page) {
          quad = page.quad;
          autoFound = true;
        } else if (!prefs.autoBorders) {
          quad = fullQuad(src.width, src.height, 0);
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
            filter: page?.filter ?? modeInfo(extra.mode).filter,
            adjust: page?.adjust ?? NO_ADJUST,
            hd: prefs.hd,
            ...extra,
          },
        });
      } catch {
        notify({ text: "That file could not be opened as a photo", tone: "error" });
      } finally {
        setBusy(null);
      }
    },
    [notify, prefs.hd, prefs.autoBorders],
  );

  const editPage = useCallback(
    async (docId: string, pageId: string) => {
      const p = await getPage(pageId);
      if (p) openPhoto([p.original], docId, p);
    },
    [openPhoto],
  );

  const afterSave = useCallback(
    async (s: Session, docId: string) => {
      bump();
      const extra: Extra = { mode: s.mode, stamps: s.stamps, fresh: s.fresh, opts: s.opts };
      if (s.queue.length) {
        notify({ text: `Page saved. ${s.queue.length} more to go` });
        openPhoto(s.queue, docId, undefined, extra);
        return;
      }
      if (s.page || !s.mode || s.mode === "scan") {
        notify({ text: s.page ? "Page updated" : "Page saved" });
        openDoc(docId);
        return;
      }
      await finishMode(s.mode, docId, s.fresh ?? [], s.stamps, s.opts);
    },
    [notify, openPhoto, bump, prefs.paper], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** The mode's own last step (ID sheet, split book pages, open a tool). */
  const finishMode = async (mode: Mode, docId: string, fresh: string[], stamps?: string[][], opts?: ModeOpts) => {
      setBusy("Finishing");
      try {
        const after = await postProcess(mode, docId, fresh, { stamps, paper: prefs.paper === "a4" ? "a4" : "letter", opts }, setBusy);
        bump();
        notify(after.note ? { text: after.note, tone: "error" } : { text: "Saved" });
        if (after.erase) void pageEditor("erase", after.open, after.erase);
        else openDoc(after.open, after.tool);
      } catch {
        notify({ text: "The pages are saved, but the last step did not finish", tone: "error" });
        openDoc(docId);
      } finally {
        setBusy(null);
      }
  };

  const onShots = useCallback(async (shots: Shots, docId?: string) => {
    const { blobs, mode } = shots;
    if (mode === "idphoto" || mode === "count" || mode === "greeting") {
      setBusy("Opening the photo");
      try {
        const photo = await blobToRaster(blobs[0], mode === "count" ? 1600 : 2400);
        setRoute(mode === "idphoto" ? { name: "idphoto", photo } : mode === "count" ? { name: "count", photo } : { name: "greeting", photo });
      }
      catch { notify({ text: "That photo could not be opened", tone: "error" }); }
      finally { setBusy(null); }
      return;
    }
    if (mode === "mega" && blobs.length > 1) {
      setBusy("Joining the shots");
      await yieldToPaint();
      try {
        const rasters: Raster[] = [];
        for (const b of blobs) rasters.push(await blobToRaster(b, 1800));
        const [first, ...more] = rasters;
        const r = await runAsync({ op: "stitch", src: first, more }, 120000);
        setBusy(null);
        openPhoto([await rasterToBlob(r.raster!, 0.92)], docId, undefined, { mode, opts: shots.opts });
      } catch {
        setBusy(null);
        notify({ text: "The shots could not be joined", tone: "error" });
      }
      return;
    }
    // Adjust after each scan off: save right away (formula and erase still need the corners)
    if (!prefs.adjustEach && mode !== "formula" && mode !== "erase") {
      setBusy("Saving");
      await yieldToPaint();
      try {
        const r = await quickSave(blobs, docId, mode, { hd: prefs.hd, autoBorders: prefs.autoBorders }, setBusy);
        bump();
        if (mode === "scan") { setBusy(null); notify({ text: blobs.length > 1 ? `${blobs.length} pages saved` : "Page saved" }); openDoc(r.docId); return; }
        await finishMode(mode, r.docId, r.fresh, shots.stamps, shots.opts);
      } catch {
        setBusy(null);
        notify({ text: "The photos could not be saved. Storage may be full.", tone: "error" });
      }
      return;
    }
    openPhoto(blobs, docId, undefined, { mode, stamps: shots.stamps, opts: shots.opts });
  }, [notify, openPhoto, prefs.adjustEach, prefs.hd, prefs.autoBorders, prefs.paper, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Import Files: PDFs and images go in as they are, without cropping. */
  const importFiles = useCallback(async (files: File[]) => {
    setBusy("Opening the files");
    await yieldToPaint();
    try {
      const pages = [];
      for (const f of files) {
        if (isPdf(f)) {
          const rasters = await pdfToRasters(f, (d, n) => setBusy(`Opening ${f.name}: page ${Math.min(d + 1, n)} of ${n}`));
          for (const r of rasters) pages.push(await pageFromRaster(r));
        } else if (f.type.startsWith("image/") || !f.type) {
          pages.push(await pageFromRaster(await blobToRaster(f, 3000)));
        }
      }
      if (!pages.length) throw new Error("none");
      const first = files[0].name.replace(/\.[^.]+$/, "") || "Imported";
      const doc = await newDoc(files.length > 1 ? `${first} and ${files.length - 1} more` : first);
      await addPages(doc.id, pages);
      bump();
      notify({ text: `${pages.length} ${pages.length === 1 ? "page" : "pages"} imported` });
      openDoc(doc.id);
    } catch {
      notify({ text: "Those files could not be opened. PDF and image files work.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }, [bump, notify]);

  const pdfFileTool = useCallback(async (t: FileTool, f: File) => {
    setBusy("Opening the PDF");
    await yieldToPaint();
    try {
      const rasters = await pdfToRasters(f, (d, n) => setBusy(`Reading page ${Math.min(d + 1, n)} of ${n}`));
      const base = safeName(f.name.replace(/\.pdf$/i, ""));
      let r: string;
      if (t === "pdf-images") {
        setBusy("Making the images");
        const files = [];
        for (let i = 0; i < rasters.length; i++) files.push({ name: `${base} ${String(i + 1).padStart(2, "0")}.jpg`, data: await rasterToBlob(rasters[i], 0.9) });
        setBusy(null);
        r = await saveMany(files, base);
      } else {
        setBusy("Joining the pages");
        const [first, ...more] = rasters;
        const out = await runAsync({ op: "stack", src: first, more }, 120000);
        const blob = await rasterToBlob(out.raster!, 0.85);
        setBusy(null);
        r = await saveFile(`${base} long.jpg`, blob);
      }
      notify(r === "saved" ? { text: "Saved" } : r === "declined" ? { text: "Save cancelled" } : { text: "Saving files is not available in this view", tone: "error" });
    } catch {
      notify({ text: "That PDF could not be opened", tone: "error" });
    } finally {
      setBusy(null);
    }
  }, [notify]);

  const sharePdf = useCallback(async (id: string) => {
    const doc = await getDoc(id);
    if (!doc) return;
    setBusy("Building PDF");
    try {
      const blob = await buildPdf(await getPages(doc), prefs.paper, doc.name);
      setBusy(null);
      const name = safeName(doc.name) + ".pdf";
      if (Capacitor.isNativePlatform()) await shareNative(name, blob, doc.name);
      else if (navigator.share) await navigator.share({ files: [new File([blob], name, { type: "application/pdf" })], title: doc.name });
      else await saveFile(name, blob);
    } catch {
      setBusy(null);
    }
  }, [prefs.paper]);

  const pageEditor = async (kind: "sign" | "erase", docId: string, pageId: string) => {
    const doc = await getDoc(docId);
    const page = await getPage(pageId);
    if (!doc || !page) return;
    const n = doc.pageIds.indexOf(pageId);
    const label = doc.pageIds.length > 1 ? `page ${n + 1}` : "";
    setRoute(kind === "sign" ? { name: "sign", docId, page, label } : { name: "erase", docId, page, label });
  };

  const backFromSession = (s: Session) => (s.docId ? openDoc(s.docId) : home());

  const tabProps = { rev, notify };
  const showTabs = route.name === "tab";

  return (
    <div className="app">
      {route.name === "tab" && route.tab === "home" && (
        <Home
          rev={rev}
          onOpen={openDoc}
          onCamera={(mode) => setRoute({ name: "camera", mode })}
          onImages={(b) => openPhoto(b)}
          onFiles={importFiles}
          onShare={sharePdf}
          onAllTools={() => setRoute({ name: "tab", tab: "tools" })}
          onAllDocs={() => setRoute({ name: "tab", tab: "docs" })}
        />
      )}
      {route.name === "tab" && route.tab === "docs" && <Documents {...tabProps} onOpen={(id) => openDoc(id)} onChanged={bump} onImages={(b) => openPhoto(b)} onFiles={importFiles} onScan={() => setRoute({ name: "camera", mode: "scan" })} />}
      {route.name === "tab" && route.tab === "tools" && (
        <Tools
          onCamera={(mode) => setRoute({ name: "camera", mode })}
          onImages={(b) => openPhoto(b)}
          onFiles={importFiles}
          onDocTool={setPickFor}
          onPdfFile={pdfFileTool}
        />
      )}
      {route.name === "tab" && route.tab === "me" && <MeTab rev={rev} prefs={prefs} setPrefs={setPrefs} notify={notify} onChanged={bump} />}

      {route.name === "doc" && (
        <DocView
          key={route.id}
          id={route.id}
          rev={rev}
          start={route.tool}
          paper={prefs.paper}
          setPaper={(paper) => setPrefs({ paper })}
          translateTo={prefs.translateTo}
          setTranslateTo={(translateTo) => setPrefs({ translateTo })}
          notify={notify}
          onBack={home}
          onPhotos={(b) => openPhoto(b, route.id)}
          onCamera={() => setRoute({ name: "camera", mode: "scan", docId: route.id })}
          onEditPage={(pid) => editPage(route.id, pid)}
          onSign={(pid) => pageEditor("sign", route.id, pid)}
          onErase={(pid) => pageEditor("erase", route.id, pid)}
          onOpenDoc={(id) => openDoc(id)}
          onChanged={bump}
        />
      )}
      {route.name === "camera" && (
        <CameraScreen
          mode={route.mode}
          adding={!!route.docId}
          prefs={prefs}
          setPrefs={setPrefs}
          notify={notify}
          onClose={() => (route.docId ? openDoc(route.docId) : home())}
          onShots={(s) => onShots(s, route.docId)}
          onAllTools={() => setRoute({ name: "tab", tab: "tools" })}
          onDocTool={setPickFor}
        />
      )}
      {route.name === "crop" && (
        <CropScreen s={route.s} onCancel={() => backFromSession(route.s)} onNext={(s) => setRoute({ name: "filter", s })} />
      )}
      {route.name === "filter" && (
        <FilterScreen s={route.s} notify={notify} onBack={(s) => setRoute({ name: "crop", s })} onSaved={afterSave} />
      )}
      {route.name === "idphoto" && (
        <IdPhotoScreen photo={route.photo} notify={notify} onCancel={home} onSaved={(id) => { bump(); notify({ text: "ID photo saved" }); openDoc(id); }} />
      )}
      {route.name === "count" && (
        <CountScreen photo={route.photo} notify={notify} onCancel={home} onSaved={(id) => { bump(); notify({ text: "Count saved" }); openDoc(id); }} />
      )}
      {route.name === "greeting" && (
        <GreetingScreen photo={route.photo} notify={notify} onCancel={home} onSaved={(id) => { bump(); notify({ text: "Card saved" }); openDoc(id); }} />
      )}
      {route.name === "sign" && (
        <SignScreen page={route.page} label={route.label} notify={notify} onDone={(changed) => { if (changed) bump(); openDoc(route.docId); }} />
      )}
      {route.name === "erase" && (
        <EraseScreen page={route.page} label={route.label} notify={notify} onDone={(changed) => { if (changed) bump(); openDoc(route.docId); }} />
      )}

      {showTabs && (
        <nav className="tabbar" aria-label="Main">
          <TabBtn on={route.tab === "home"} label="Home" icon={<I.Home />} onClick={() => setRoute({ name: "tab", tab: "home" })} />
          <TabBtn on={route.tab === "docs"} label="All Documents" icon={<I.Docs />} onClick={() => setRoute({ name: "tab", tab: "docs" })} />
          <TabBtn on={route.tab === "tools"} label="Tools" icon={<I.Tools />} onClick={() => setRoute({ name: "tab", tab: "tools" })} />
          <TabBtn on={route.tab === "me"} label="Me" icon={<I.Me />} onClick={() => setRoute({ name: "tab", tab: "me" })} />
        </nav>
      )}

      {pickFor && <DocPicker rev={rev} tool={pickFor} onClose={() => setPickFor(null)} onPick={(id) => { setPickFor(null); openDoc(id, pickFor); }} />}

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
        <div className={"toast" + (toast.tone === "error" ? " toast-error" : "") + (showTabs ? " toast-tabs" : "")} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function TabBtn({ on, label, icon, onClick }: { on: boolean; label: string; icon: JSX.Element; onClick(): void }) {
  return (
    <button className={"tab" + (on ? " on" : "")} onClick={onClick} aria-current={on ? "page" : undefined}>
      {icon}<span>{label}</span>
    </button>
  );
}

function MeTab({ rev, prefs, setPrefs, notify, onChanged }: {
  rev: number; prefs: ReturnType<typeof usePrefs>[0]; setPrefs: ReturnType<typeof usePrefs>[1]; notify(t: Toast): void; onChanged(): void;
}) {
  const { rows } = useDocs(rev);
  return <Settings prefs={prefs} setPrefs={setPrefs} docCount={rows?.length ?? 0} notify={notify} onChanged={onChanged} />;
}

const TOOL_NAMES: Partial<Record<DocTool, string>> = {
  word: "To Word", excel: "To Excel", pptx: "To PPT", pdf: "To PDF", long: "Long image", sign: "Sign",
  watermark: "Watermark", erase: "Smart erase", marks: "Erase marks", restore: "Restore photo", merge: "Merge files",
  extract: "Extract pages", reorder: "Reorder pages", lock: "Lock with password", compress: "Compress", print: "Print",
  colorize: "Colorize", translate: "Translate", questions: "Incorrect Question",
  latex: "Formula to LaTeX", chat: "AI Chat", "ai-restore": "AI Restore", "ai-colorize": "AI Colorize",
};

function DocPicker({ rev, tool, onPick, onClose }: { rev: number; tool: DocTool; onPick(id: string): void; onClose(): void }) {
  const { rows } = useDocs(rev);
  const list = (rows ?? []).filter((r) => r.doc.pageIds.length);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{TOOL_NAMES[tool] ?? "Tool"}: pick a document</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><I.Close /></button>
        </div>
        {rows && !list.length && <p className="muted">No documents yet. Scan or import one first.</p>}
        <ul className="doc-list">
          {list.map(({ doc, thumb }) => (
            <li key={doc.id}>
              <button className="doc-row" onClick={() => onPick(doc.id)}>
                <span className="doc-thumb">{thumb ? <img src={thumb} alt="" /> : <I.Pdf />}</span>
                <span className="doc-meta"><span className="doc-name">{doc.name}</span><span className="doc-sub mono">{doc.pageIds.length} pages</span></span>
                <I.Right />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
