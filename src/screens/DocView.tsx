import { useEffect, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import { deleteDoc, deletePage, getDoc, getPages, putDoc, type DocRec, type PageRec } from "../lib/store";
import { buildPdf, PAPER, type PaperSize } from "../lib/pdf";
import { Capacitor } from "@capacitor/core";
import { canShareFiles, safeName, saveFile, shareNative } from "../lib/save";
import { OCR_LANGS, recognize, recognizeWithClaude, type OcrLang } from "../lib/ocr";
import { PhotoButtons } from "./PhotoButtons";

interface Props {
  id: string;
  rev: number;
  notify(t: Toast): void;
  onBack(): void;
  onPhotos(b: Blob[]): void;
  onEditPage(pageId: string): void;
  onChanged(): void;
}

type Sheet = null | { kind: "page"; index: number } | { kind: "pdf" } | { kind: "text" } | { kind: "delete" };

function usePaper(): [PaperSize, (p: PaperSize) => void] {
  const [p, setP] = useState<PaperSize>(() => {
    try { return (localStorage.getItem("waraqa-paper") as PaperSize) || "letter"; } catch { return "letter"; }
  });
  return [p, (v) => { setP(v); try { localStorage.setItem("waraqa-paper", v); } catch { /* ignore */ } }];
}

export function DocView({ id, rev, notify, onBack, onPhotos, onEditPage, onChanged }: Props) {
  const [doc, setDoc] = useState<DocRec | null>(null);
  const [pages, setPages] = useState<PageRec[]>([]);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [paper, setPaper] = usePaper();
  const [working, setWorking] = useState<string | null>(null);
  const [lang, setLang] = useState<OcrLang>("eng");
  const [ocr, setOcr] = useState<{ label: string; value: number } | null>(null);
  const [text, setText] = useState("");

  const load = async () => {
    const d = await getDoc(id);
    if (!d) return onBack();
    setDoc(d);
    setName(d.name);
    setText(d.text ?? "");
    setPages(await getPages(d));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, rev]);

  if (!doc) return <main className="page"><p className="muted">Opening…</p></main>;

  const rename = async () => {
    const n = name.trim() || doc.name;
    setName(n);
    if (n === doc.name) return;
    const d = { ...doc, name: n, updatedAt: Date.now() };
    await putDoc(d);
    setDoc(d);
    onChanged();
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= pages.length) return;
    const ids = [...doc.pageIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    const d = { ...doc, pageIds: ids, updatedAt: Date.now() };
    await putDoc(d);
    setDoc(d);
    const p = [...pages];
    const [y] = p.splice(from, 1);
    p.splice(to, 0, y);
    setPages(p);
    setSheet({ kind: "page", index: to });
    onChanged();
  };

  const removePage = async (i: number) => {
    await deletePage(doc.id, pages[i].id);
    setSheet(null);
    notify({ text: "Page deleted" });
    await load();
    onChanged();
  };

  const report = (r: string, what: string) => {
    if (r === "saved") notify({ text: `${what} saved` });
    else if (r === "declined") notify({ text: "Save cancelled" });
    else notify({ text: "Saving files is not available in this view", tone: "error" });
  };

  const exportPdf = async () => {
    setWorking("Building PDF");
    try {
      const blob = await buildPdf(pages, paper, doc.name);
      setWorking(null);
      report(await saveFile(safeName(doc.name) + ".pdf", blob), "PDF");
    } catch (e) {
      setWorking(null);
      notify({ text: e instanceof Error ? e.message : "The PDF could not be built", tone: "error" });
    }
  };

  const sharePdf = async () => {
    setWorking("Building PDF");
    try {
      const blob = await buildPdf(pages, paper, doc.name);
      setWorking(null);
      if (Capacitor.isNativePlatform()) {
        await shareNative(safeName(doc.name) + ".pdf", blob, doc.name);
        return;
      }
      const file = new File([blob], safeName(doc.name) + ".pdf", { type: "application/pdf" });
      await navigator.share({ files: [file], title: doc.name });
    } catch {
      setWorking(null);
    }
  };

  const saveJpg = async (i: number) => {
    const n = pages.length > 1 ? ` page ${i + 1}` : "";
    report(await saveFile(`${safeName(doc.name)}${n}.jpg`, pages[i].result), "Image");
  };

  const runOcr = async () => {
    setOcr({ label: "Starting", value: 0 });
    try {
      const imgs = pages.map((p) => p.result);
      const onP = (label: string, value: number) => setOcr({ label, value });
      let parts: string[] | null;
      try {
        parts = await recognize(imgs, lang, onP);
      } catch (err) {
        parts = await recognizeWithClaude(imgs, lang, onP);
        if (!parts) throw err instanceof Error ? err : new Error("Text reading could not start in this view");
      }
      const joined = parts.map((t, i) => (parts.length > 1 ? `— Page ${i + 1} —\n${t}` : t)).join("\n\n");
      setText(joined);
      const d = { ...doc, text: joined, updatedAt: Date.now() };
      await putDoc(d);
      setDoc(d);
      onChanged();
    } catch (e) {
      notify({ text: e instanceof Error ? e.message : "Text reading could not start in this view", tone: "error" });
    } finally {
      setOcr(null);
    }
  };

  const saveText = async () => {
    if (text === (doc.text ?? "")) return;
    const d = { ...doc, text, updatedAt: Date.now() };
    await putDoc(d);
    setDoc(d);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ text: "Text copied" });
    } catch {
      const ta = document.getElementById("ocr-text") as HTMLTextAreaElement | null;
      ta?.select();
      notify({ text: "Text selected. Use your phone's Copy." });
    }
  };

  const shareOk = Capacitor.isNativePlatform() || typeof navigator.share === "function" &&
    canShareFiles(new File([new Blob(["x"])], "x.pdf", { type: "application/pdf" }));

  const page = sheet?.kind === "page" ? pages[sheet.index] : null;

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onBack} aria-label="All documents"><I.Back /></button>
        <input
          id="doc-name"
          className="title-input"
          value={name}
          aria-label="Document name"
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <button className="icon-btn" onClick={() => setSheet({ kind: "delete" })} aria-label="Delete document"><I.Trash /></button>
      </header>
      <main className="page">
        {doc.sample && (
          <p className="note">This is an example scan made from a sample photo. Delete it whenever you like.</p>
        )}
        <div className="doc-actions">
          <button className="action" onClick={() => setSheet({ kind: "pdf" })} disabled={!pages.length}>
            <I.Pdf /><span>PDF</span>
          </button>
          <button className="action" onClick={() => setSheet({ kind: "text" })} disabled={!pages.length}>
            <I.Text /><span>Text</span>
          </button>
          {shareOk && (
            <button className="action" onClick={sharePdf} disabled={!pages.length}>
              <I.Share /><span>Share</span>
            </button>
          )}
        </div>
        <ol className="page-grid">
          {pages.map((p, i) => (
            <li key={p.id}>
              <button className="page-card" onClick={() => setSheet({ kind: "page", index: i })} aria-label={`Page ${i + 1}`}>
                <img src={p.thumb} alt="" />
              </button>
              <span className="page-no mono">{String(i + 1).padStart(2, "0")}</span>
            </li>
          ))}
        </ol>
        {!pages.length && <p className="muted">No pages yet. Scan or import a photo to add one.</p>}
      </main>
      <footer className="dock">
        <span className="dock-label">Add page</span>
        <PhotoButtons onPhotos={onPhotos} compact />
      </footer>

      {sheet && (
        <div className="scrim" onClick={() => setSheet(null)}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {sheet.kind === "page" && page && (
              <>
                <div className="sheet-head">
                  <h2>Page {sheet.index + 1} of {pages.length}</h2>
                  <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">✕</button>
                </div>
                <PageImage page={page} />
                <div className="sheet-actions">
                  <button className="tool" onClick={() => move(sheet.index, sheet.index - 1)} disabled={sheet.index === 0}><I.Left /><span>Earlier</span></button>
                  <button className="tool" onClick={() => move(sheet.index, sheet.index + 1)} disabled={sheet.index === pages.length - 1}><I.Right /><span>Later</span></button>
                  <button className="tool" onClick={() => onEditPage(page.id)}><I.Pencil /><span>Edit</span></button>
                  <button className="tool" onClick={() => saveJpg(sheet.index)}><I.Download /><span>JPG</span></button>
                  <button className="tool tool-danger" onClick={() => removePage(sheet.index)}><I.Trash /><span>Delete</span></button>
                </div>
              </>
            )}
            {sheet.kind === "pdf" && (
              <>
                <div className="sheet-head">
                  <h2>Save as PDF</h2>
                  <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">✕</button>
                </div>
                <p className="muted">{pages.length} {pages.length === 1 ? "page" : "pages"}, in the order shown.</p>
                <div className="seg" role="radiogroup" aria-label="Paper size">
                  {PAPER.map((p) => (
                    <button key={p.id} role="radio" aria-checked={paper === p.id} className={paper === p.id ? "on" : ""} onClick={() => setPaper(p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary wide" onClick={exportPdf} disabled={!!working}>
                  {working ?? "Save PDF"}
                </button>
              </>
            )}
            {sheet.kind === "text" && (
              <>
                <div className="sheet-head">
                  <h2>Text from scan</h2>
                  <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">✕</button>
                </div>
                <div className="seg" role="radiogroup" aria-label="Language">
                  {OCR_LANGS.map((l) => (
                    <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? "on" : ""} onClick={() => setLang(l.id)} disabled={!!ocr}>
                      {l.label}
                    </button>
                  ))}
                </div>
                {ocr ? (
                  <div className="progress" aria-live="polite">
                    <div className="progress-bar"><span style={{ width: `${Math.round(ocr.value * 100)}%` }} /></div>
                    <span className="muted">{ocr.label}</span>
                  </div>
                ) : (
                  <button className="btn btn-primary wide" onClick={runOcr}>{text ? "Read again" : "Read text"}</button>
                )}
                {text && (
                  <>
                    <textarea
                      id="ocr-text"
                      className="ocr-text"
                      dir="auto"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onBlur={saveText}
                    />
                    <button className="btn btn-quiet wide" onClick={copyText}><I.Copy /> Copy text</button>
                  </>
                )}
                {!text && !ocr && (
                  <p className="muted">The first read downloads the language data once (about 3 MB for English, 2 MB for Arabic). Then it works offline.</p>
                )}
              </>
            )}
            {sheet.kind === "delete" && (
              <>
                <div className="sheet-head">
                  <h2>Delete “{doc.name}”?</h2>
                </div>
                <p className="muted">All {pages.length} pages and the read text are removed from this phone. This cannot be undone.</p>
                <div className="row-2">
                  <button className="btn btn-quiet" onClick={() => setSheet(null)}>Keep it</button>
                  <button className="btn btn-danger" onClick={async () => { await deleteDoc(doc.id); onChanged(); onBack(); }}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PageImage({ page }: { page: PageRec }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(page.result);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [page.result]);
  return <div className="page-view">{url && <img src={url} alt="Scanned page" />}</div>;
}
