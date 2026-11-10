import { useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import {
  copyPages, deleteDoc, deletePage, getDoc, getPages, listFolders, newDoc, putDoc, replaceResult, TAGS,
  type DocRec, type FolderRec, type PageRec,
} from "../lib/store";
import { buildPdf, PAPER, type PaperSize, type PdfOptions } from "../lib/pdf";
import { Capacitor } from "@capacitor/core";
import { canShareFiles, safeName, saveFile, saveMany, shareNative } from "../lib/save";
import { OCR_LANGS, recognize, recognizeWithClaude, type OcrLang } from "../lib/ocr";
import { toDocx, toLatexDocx, toLongImage, toPptx, toReviewDocx, toXlsx } from "../lib/exporters";
import { aiPhoto, docContext, formulaToLatex, MissingKey, openRouterChat, type ChatMsg } from "../lib/ai";
import { getSecret } from "../lib/secrets";
import { canTranslateOnDevice, onlineTranslateUrl, TARGETS, targetLabel, translateOnDevice } from "../lib/translate";
import { splitQuestions } from "../lib/questions";
import { printPdf } from "../lib/print";
import { runAsync } from "../lib/engine";
import { blobToRaster, rasterThumb, rasterToBlob } from "../lib/io";
import { PhotoButtons } from "./PhotoButtons";
import { useDocs } from "./useDocs";

export type DocTool =
  | "text" | "word" | "excel" | "pptx" | "pdf" | "long" | "images" | "sign" | "watermark" | "erase"
  | "marks" | "restore" | "colorize" | "merge" | "extract" | "reorder" | "lock" | "compress" | "print" | "tags"
  | "translate" | "questions" | "latex" | "chat" | "ai-restore" | "ai-colorize";

type PageJob = "sign" | "erase" | "marks" | "restore" | "colorize" | "ai-restore" | "ai-colorize";

interface Props {
  id: string;
  rev: number;
  start?: DocTool;
  paper: PaperSize;
  setPaper(p: PaperSize): void;
  translateTo: string;
  setTranslateTo(l: string): void;
  notify(t: Toast): void;
  onBack(): void;
  onPhotos(b: Blob[]): void;
  onCamera(): void;
  onEditPage(pageId: string): void;
  onSign(pageId: string): void;
  onErase(pageId: string): void;
  onOpenDoc(id: string): void;
  onChanged(): void;
}

type Convert = "word" | "excel" | "pptx";
type PdfFocus = "plain" | "watermark" | "lock" | "compress" | "print";
type Sheet =
  | null
  | { kind: "page"; index: number }
  | { kind: "pdf"; focus: PdfFocus }
  | { kind: "text" }
  | { kind: "convert"; to: Convert }
  | { kind: "tools" }
  | { kind: "pick"; then: PageJob }
  | { kind: "latex" }
  | { kind: "chat" }
  | { kind: "translate" }
  | { kind: "questions" }
  | { kind: "extract" }
  | { kind: "reorder" }
  | { kind: "merge" }
  | { kind: "tags" }
  | { kind: "delete" };

/** Splits the stored text back into pages ("— Page 2 —" lines). */
function textPages(text: string, n: number): string[] {
  if (!text) return [];
  const parts = text.split(/^— Page \d+ —\n?/m);
  if (parts.length > 1) return parts.slice(1).map((s) => s.trim());
  return n > 1 ? [text, ...Array(n - 1).fill("")] : [text];
}

export function DocView(props: Props) {
  const { id, rev, start, paper, setPaper, translateTo, setTranslateTo, notify, onBack, onPhotos, onCamera, onEditPage, onSign, onErase, onOpenDoc, onChanged } = props;
  const [doc, setDoc] = useState<DocRec | null>(null);
  const [pages, setPages] = useState<PageRec[]>([]);
  const [folders, setFolders] = useState<FolderRec[]>([]);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [lang, setLang] = useState<OcrLang>("eng");
  const [ocr, setOcr] = useState<{ label: string; value: number } | null>(null);
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<PdfOptions>({});
  const [withImages, setWithImages] = useState(true);
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [translated, setTranslated] = useState<string | null>(null);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [latex, setLatex] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [ask, setAsk] = useState("");
  const chatCtx = useRef<ChatMsg[] | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const load = async () => {
    const d = await getDoc(id);
    if (!d) return onBack();
    setDoc(d);
    setName(d.name);
    setText(d.text ?? "");
    setPages(await getPages(d));
    listFolders().then(setFolders).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, rev]);

  // A tool chosen before the document opened (Tools tab, camera modes, Home).
  useEffect(() => {
    if (!doc || !start || started.current || !pages.length) return;
    started.current = true;
    openTool(start);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return <main className="page"><p className="muted">Opening…</p></main>;

  function openTool(t: DocTool) {
    const key = t === "latex" || t === "chat" ? "openrouter" : t === "ai-restore" || t === "ai-colorize" ? "replicate" : null;
    if (key) {
      void getSecret(key).then((k) => k ? toolNow(t) : notify({ text: new MissingKey(key).message, tone: "error" }));
      return;
    }
    toolNow(t);
  }

  function toolNow(t: DocTool) {
    switch (t) {
      case "text":
        setSheet({ kind: "text" });
        if (!textPages(text, pages.length).some((x) => x.trim())) void runOcr();
        return;
      case "word": case "excel": case "pptx": return setSheet({ kind: "convert", to: t });
      case "pdf": return setSheet({ kind: "pdf", focus: "plain" });
      case "watermark": case "lock": case "compress": case "print":
        setOpts((o) => ({ ...o, compress: t === "compress" ? true : o.compress }));
        return setSheet({ kind: "pdf", focus: t });
      case "long": setSheet(null); return void longImage();
      case "images": setSheet(null); return void allImages();
      case "translate":
        setTranslated(null);
        setSheet({ kind: "translate" });
        if (!textPages(text, pages.length).some((x) => x.trim())) void runOcr();
        return;
      case "questions":
        setWrong(new Set());
        setSheet({ kind: "questions" });
        if (!textPages(text, pages.length).some((x) => x.trim())) void runOcr();
        return;
      case "latex": setLatex(null); return setSheet({ kind: "latex" });
      case "chat": return setSheet({ kind: "chat" });
      case "sign": case "erase": case "marks": case "restore": case "colorize": case "ai-restore": case "ai-colorize":
        if (pages.length === 1) return void pickedPage(t, 0);
        return setSheet({ kind: "pick", then: t });
      case "merge": return setSheet({ kind: "merge" });
      case "extract": setPicks(new Set()); return setSheet({ kind: "extract" });
      case "reorder": return setSheet({ kind: "reorder" });
      case "tags": return setSheet({ kind: "tags" });
    }
  }

  const save = async (d: DocRec) => { await putDoc(d); setDoc(d); onChanged(); };

  const rename = async () => {
    const n = name.trim() || doc.name;
    setName(n);
    if (n !== doc.name) await save({ ...doc, name: n, updatedAt: Date.now() });
  };

  const move = async (from: number, to: number, keepSheet = true) => {
    if (to < 0 || to >= pages.length) return;
    const ids = [...doc.pageIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    await save({ ...doc, pageIds: ids, updatedAt: Date.now() });
    const p = [...pages];
    const [y] = p.splice(from, 1);
    p.splice(to, 0, y);
    setPages(p);
    if (keepSheet) setSheet({ kind: "page", index: to });
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

  const fail = (e: unknown, what: string) => {
    setWorking(null);
    notify({ text: e instanceof Error && e.message ? e.message : `${what} could not be made`, tone: "error" });
  };

  const pdfName = () => safeName(doc.name) + (opts.password ? " (locked)" : "") + ".pdf";

  const makePdf = () => buildPdf(pages, paper, doc.name, {
    compress: opts.compress, watermark: opts.watermark?.trim() || undefined, password: opts.password || undefined,
  });

  const exportPdf = async () => {
    setWorking("Building PDF");
    try {
      const blob = await makePdf();
      setWorking(null);
      report(await saveFile(pdfName(), blob), "PDF");
    } catch (e) { fail(e, "The PDF"); }
  };

  const sharePdf = async () => {
    setWorking("Building PDF");
    try {
      const blob = await makePdf();
      setWorking(null);
      if (Capacitor.isNativePlatform()) { await shareNative(pdfName(), blob, doc.name); return; }
      await navigator.share({ files: [new File([blob], pdfName(), { type: "application/pdf" })], title: doc.name });
    } catch { setWorking(null); }
  };

  const print = async () => {
    setWorking("Preparing to print");
    try {
      const blob = await buildPdf(pages, paper, doc.name, { watermark: opts.watermark?.trim() || undefined });
      setWorking(null);
      await printPdf(blob, safeName(doc.name));
    } catch (e) { fail(e, "The print file"); }
  };

  const saveJpg = async (i: number) => {
    const n = pages.length > 1 ? ` page ${i + 1}` : "";
    report(await saveFile(`${safeName(doc.name)}${n}.jpg`, pages[i].result), "Image");
  };

  const allImages = async () => {
    const files = pages.map((p, i) => ({ name: `${safeName(doc.name)} ${String(i + 1).padStart(2, "0")}.jpg`, data: p.result }));
    report(await saveMany(files, doc.name), pages.length > 1 ? "Images" : "Image");
  };

  const longImage = async () => {
    setWorking("Joining the pages");
    try {
      const blob = await toLongImage(pages);
      setWorking(null);
      report(await saveFile(`${safeName(doc.name)} long.jpg`, blob), "Long image");
    } catch (e) { fail(e, "The long image"); }
  };

  /** Reads the text when there is none yet; returns one string per page. */
  const ensureText = async (force = false): Promise<string[]> => {
    const have = textPages(text, pages.length);
    if (!force && have.some((t) => t.trim())) return have;
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
      const joined = parts.map((t, i) => (parts!.length > 1 ? `— Page ${i + 1} —\n${t}` : t)).join("\n\n");
      setText(joined);
      await save({ ...doc, text: joined, updatedAt: Date.now() });
      return parts;
    } finally {
      setOcr(null);
    }
  };

  const runOcr = async () => {
    try {
      await ensureText(true);
    } catch (e) {
      notify({ text: e instanceof Error ? e.message : "Text reading could not start in this view", tone: "error" });
    }
  };

  const convert = async (to: Convert) => {
    try {
      const texts = to === "pptx" ? textPages(text, pages.length) : await ensureText();
      setWorking(to === "word" ? "Making the Word file" : to === "excel" ? "Making the Excel file" : "Making the slides");
      const blob = to === "word" ? await toDocx(doc.name, texts, pages, withImages)
        : to === "excel" ? await toXlsx(texts) : await toPptx(doc.name, pages, texts);
      setWorking(null);
      const ext = to === "word" ? "docx" : to === "excel" ? "xlsx" : "pptx";
      report(await saveFile(`${safeName(doc.name)}.${ext}`, blob), to === "word" ? "Word file" : to === "excel" ? "Excel file" : "PowerPoint file");
    } catch (e) { fail(e, "The file"); }
  };

  const doTranslate = async () => {
    try {
      const src = (await ensureText()).join("\n\n").trim();
      if (!src) { notify({ text: "No text was found on these pages", tone: "error" }); return; }
      setWorking("Translating on this phone");
      const out = await translateOnDevice(src, translateTo);
      setWorking(null);
      if (out === null) notify({ text: "This phone cannot translate that language offline. Use Google Translate below.", tone: "error" });
      else setTranslated(out);
    } catch (e) { fail(e, "The translation"); }
  };

  const translatedWord = async () => {
    if (!translated) return;
    setWorking("Making the Word file");
    try {
      const blob = await toDocx(`${doc.name} (${targetLabel(translateTo)})`, [translated], [], false);
      setWorking(null);
      report(await saveFile(`${safeName(doc.name)} ${targetLabel(translateTo)}.docx`, blob), "Word file");
    } catch (e) { fail(e, "The file"); }
  };

  const questionList = splitQuestions(textPages(text, pages.length).join("\n"));

  const saveReview = async () => {
    const chosen = questionList.filter((_, i) => wrong.has(i));
    if (!chosen.length) return;
    setWorking("Making the review sheet");
    try {
      const blob = await toReviewDocx(`Review: ${doc.name}`, chosen);
      setWorking(null);
      report(await saveFile(`${safeName(doc.name)} review.docx`, blob), "Review sheet");
    } catch (e) { fail(e, "The review sheet"); }
  };

  const readLatex = async () => {
    setWorking("Reading the formulas");
    try {
      const parts: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        if (pages.length > 1) setWorking(`Reading formulas on page ${i + 1} of ${pages.length}`);
        const t = await formulaToLatex(pages[i].result);
        if (t) parts.push(t);
      }
      setWorking(null);
      setLatex(parts.join("\n\n"));
      if (!parts.length) notify({ text: "No formulas were found", tone: "error" });
    } catch (e) { fail(e, "Reading the formulas"); }
  };

  const latexWord = async () => {
    if (!latex) return;
    setWorking("Making the Word file");
    try {
      const blob = await toLatexDocx(doc.name, latex, pages);
      setWorking(null);
      report(await saveFile(`${safeName(doc.name)} formulas.docx`, blob), "Word file");
    } catch (e) { fail(e, "The file"); }
  };

  const sendChat = async () => {
    const q = ask.trim();
    if (!q || working) return;
    const before = chat;
    setChat([...before, { role: "user", text: q }]);
    setAsk("");
    setWorking("Thinking");
    try {
      if (!chatCtx.current) {
        let t = textPages(text, pages.length).join("\n\n").trim();
        if (!t) { try { t = (await ensureText()).join("\n\n"); } catch { /* images only */ } }
        chatCtx.current = await docContext(doc.name, t, pages.map((p) => p.result));
      }
      const msgs: ChatMsg[] = [...chatCtx.current, ...before.map((m) => ({ role: m.role, content: m.text })), { role: "user", content: q }];
      const a = await openRouterChat(msgs);
      setChat((c) => [...c, { role: "assistant", text: a }]);
      setWorking(null);
      setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setChat(before);
      setAsk(q);
      fail(e, "AI Chat");
    }
  };

  const saveText = async () => {
    if (text !== (doc.text ?? "")) await save({ ...doc, text });
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ text: "Text copied" });
    } catch {
      (document.getElementById("ocr-text") as HTMLTextAreaElement | null)?.select();
      notify({ text: "Text selected. Use your phone's Copy." });
    }
  };

  async function pickedPage(then: PageJob, i: number) {
    const p = pages[i];
    if (then === "sign") return onSign(p.id);
    if (then === "erase") return onErase(p.id);
    setSheet(null);
    if (then === "ai-restore" || then === "ai-colorize") {
      setWorking(then === "ai-restore" ? "AI is restoring the photo" : "AI is adding color");
      try {
        const out = await aiPhoto(then === "ai-restore" ? "restore" : "colorize", p.result, (s) => setWorking(s));
        const r = await blobToRaster(out, 4000);
        await replaceResult(p, await rasterToBlob(r, 0.92), rasterThumb(r), r.width, r.height);
        setWorking(null);
        notify({ text: "Page updated. Edit brings back the original." });
        await load();
        onChanged();
      } catch (e) { fail(e, "The AI photo"); }
      return;
    }
    setWorking(then === "marks" ? "Erasing pen marks" : then === "colorize" ? "Adding color" : "Restoring the photo");
    try {
      const r = await runAsync({ op: "tool", tool: then === "marks" ? "eraseMarks" : then === "colorize" ? "colorize" : "restore", src: await blobToRaster(p.result, 3000) }, 90000);
      if (!r.raster) throw new Error("");
      await replaceResult(p, await rasterToBlob(r.raster, 0.92), rasterThumb(r.raster), r.raster.width, r.raster.height);
      setWorking(null);
      notify({ text: "Page updated. Edit brings back the original." });
      await load();
      onChanged();
    } catch (e) { fail(e, "The page"); }
  }

  const extract = async () => {
    const chosen = pages.filter((_, i) => picks.has(i));
    if (!chosen.length) return;
    const d = await newDoc(`${doc.name} (pages ${[...picks].sort((a, b) => a - b).map((i) => i + 1).join(", ")})`, { folderId: doc.folderId, tags: doc.tags });
    await copyPages(chosen, d.id);
    setSheet(null);
    onChanged();
    notify({ text: `${chosen.length} ${chosen.length === 1 ? "page" : "pages"} copied to a new document` });
    onOpenDoc(d.id);
  };

  const mergeFrom = async (otherId: string) => {
    const other = await getDoc(otherId);
    if (!other) return;
    setWorking("Merging");
    await copyPages(await getPages(other), doc.id);
    setWorking(null);
    setSheet(null);
    notify({ text: `Added ${other.pageIds.length} pages from “${other.name}”` });
    await load();
    onChanged();
  };

  const toggleTag = (t: string) => {
    const s = new Set(doc.tags ?? []);
    if (s.has(t)) s.delete(t); else s.add(t);
    save({ ...doc, tags: [...s] });
  };

  const shareOk = Capacitor.isNativePlatform() || (typeof navigator.share === "function" &&
    canShareFiles(new File([new Blob(["x"])], "x.pdf", { type: "application/pdf" })));

  const page = sheet?.kind === "page" ? pages[sheet.index] : null;
  const close = () => setSheet(null);
  const head = (title: string) => (
    <div className="sheet-head">
      <h2>{title}</h2>
      <button className="icon-btn" onClick={close} aria-label="Close"><I.Close /></button>
    </div>
  );
  const busyBtn = (label: string, run: () => void, primary = true) => (
    <button className={"btn wide " + (primary ? "btn-primary" : "btn-quiet")} onClick={run} disabled={!!working || !!ocr}>
      {working ?? label}
    </button>
  );
  const progress = ocr && (
    <div className="progress" aria-live="polite">
      <div className="progress-bar"><span style={{ width: `${Math.round(ocr.value * 100)}%` }} /></div>
      <span className="muted">{ocr.label}</span>
    </div>
  );
  const langPick = (
    <div className="seg" role="radiogroup" aria-label="Language">
      {OCR_LANGS.map((l) => (
        <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? "on" : ""} onClick={() => setLang(l.id)} disabled={!!ocr}>{l.label}</button>
      ))}
    </div>
  );

  const TOOLS: { t: DocTool; label: string; icon: JSX.Element }[] = [
    { t: "word", label: "To Word", icon: <I.Word /> },
    { t: "excel", label: "To Excel", icon: <I.Excel /> },
    { t: "pptx", label: "To PPT", icon: <I.Ppt /> },
    { t: "images", label: "Images", icon: <I.Images size={20} /> },
    { t: "long", label: "Long Image", icon: <I.Long /> },
    { t: "sign", label: "Sign", icon: <I.Sign /> },
    { t: "watermark", label: "Watermark", icon: <I.Drop /> },
    { t: "erase", label: "Smart Erase", icon: <I.Eraser /> },
    { t: "marks", label: "Erase Marks", icon: <I.Wand /> },
    { t: "restore", label: "Restore Photo", icon: <I.Restore /> },
    { t: "colorize", label: "Colorize", icon: <I.Drop /> },
    { t: "translate", label: "Translate", icon: <I.Translate /> },
    { t: "latex", label: "Formula to LaTeX", icon: <I.Formula /> },
    { t: "chat", label: "AI Chat", icon: <I.Sparkle /> },
    { t: "ai-restore", label: "AI Restore", icon: <I.Sparkle /> },
    { t: "ai-colorize", label: "AI Colorize", icon: <I.Sparkle /> },
    { t: "questions", label: "Incorrect Question", icon: <I.Question /> },
    { t: "merge", label: "Merge", icon: <I.Merge /> },
    { t: "extract", label: "Extract Pages", icon: <I.Cut /> },
    { t: "reorder", label: "Reorder", icon: <I.Sort /> },
    { t: "lock", label: "Lock", icon: <I.Lock /> },
    { t: "compress", label: "Compress", icon: <I.Compress /> },
    { t: "print", label: "Print", icon: <I.Print /> },
    { t: "tags", label: "Tags & Folder", icon: <I.Tag /> },
  ];

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><I.Back /></button>
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
        {doc.sample && <p className="note">This is an example scan made from a sample photo. Delete it whenever you like.</p>}
        {(doc.tags?.length ?? 0) > 0 && (
          <div className="chips">{doc.tags!.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        )}
        <div className="doc-actions">
          <button className="action" onClick={() => setSheet({ kind: "pdf", focus: "plain" })} disabled={!pages.length}><I.Pdf /><span>PDF</span></button>
          <button className="action" onClick={() => setSheet({ kind: "text" })} disabled={!pages.length}><I.Text /><span>Text</span></button>
          {shareOk && <button className="action" onClick={sharePdf} disabled={!pages.length}><I.Share /><span>Share</span></button>}
          <button className="action" onClick={() => setSheet({ kind: "tools" })} disabled={!pages.length}><I.Tools size={20} /><span>Tools</span></button>
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
        <div className="photo-buttons compact">
          <PhotoButtons onPhotos={onPhotos} compact importOnly />
          <button className="btn btn-primary" onClick={onCamera}><I.Camera /> Scan</button>
        </div>
      </footer>

      {sheet && (
        <div className="scrim" onClick={close}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {sheet.kind === "page" && page && (
              <>
                {head(`Page ${sheet.index + 1} of ${pages.length}`)}
                <PageImage page={page} />
                <div className="sheet-actions">
                  <button className="tool" onClick={() => move(sheet.index, sheet.index - 1)} disabled={sheet.index === 0}><I.Left /><span>Earlier</span></button>
                  <button className="tool" onClick={() => move(sheet.index, sheet.index + 1)} disabled={sheet.index === pages.length - 1}><I.Right /><span>Later</span></button>
                  <button className="tool" onClick={() => onEditPage(page.id)}><I.Pencil /><span>Edit</span></button>
                  <button className="tool" onClick={() => saveJpg(sheet.index)}><I.Download /><span>JPG</span></button>
                  <button className="tool tool-danger" onClick={() => removePage(sheet.index)}><I.Trash /><span>Delete</span></button>
                </div>
                <div className="sheet-actions">
                  <button className="tool" onClick={() => onSign(page.id)}><I.Sign /><span>Sign</span></button>
                  <button className="tool" onClick={() => onErase(page.id)}><I.Eraser /><span>Smart erase</span></button>
                  <button className="tool" onClick={() => pickedPage("marks", sheet.index)}><I.Wand /><span>Erase marks</span></button>
                  <button className="tool" onClick={() => pickedPage("restore", sheet.index)}><I.Restore /><span>Restore</span></button>
                </div>
              </>
            )}

            {sheet.kind === "tools" && (
              <>
                {head("Tools")}
                <div className="tool-grid">
                  {TOOLS.map((x) => (
                    <button key={x.t} className="tg-btn" onClick={() => openTool(x.t)}>
                      <span className="tg-ic">{x.icon}</span><span>{x.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet.kind === "pdf" && (
              <>
                {head(sheet.focus === "print" ? "Print" : sheet.focus === "lock" ? "Lock with password" : sheet.focus === "watermark" ? "Add watermark" : sheet.focus === "compress" ? "Compress PDF" : "Save as PDF")}
                <p className="muted">{pages.length} {pages.length === 1 ? "page" : "pages"}, in the order shown.</p>
                <div className="seg" role="radiogroup" aria-label="Paper size">
                  {PAPER.map((p) => (
                    <button key={p.id} role="radio" aria-checked={paper === p.id} className={paper === p.id ? "on" : ""} onClick={() => setPaper(p.id)}>{p.label}</button>
                  ))}
                </div>
                <label className="field-row" htmlFor="pdf-wm">
                  <span><I.Drop size={18} /> Watermark</span>
                  <input id="pdf-wm" className="field" placeholder="No watermark" value={opts.watermark ?? ""} autoFocus={sheet.focus === "watermark"}
                    onChange={(e) => setOpts({ ...opts, watermark: e.target.value })} />
                </label>
                {sheet.focus !== "print" && (
                  <>
                    <label className="field-row" htmlFor="pdf-pw">
                      <span><I.Lock size={18} /> Password</span>
                      <input id="pdf-pw" className="field" type="password" placeholder="No password" autoComplete="new-password" value={opts.password ?? ""} autoFocus={sheet.focus === "lock"}
                        onChange={(e) => setOpts({ ...opts, password: e.target.value })} />
                    </label>
                    {opts.password && <p className="muted small">The PDF asks for this password to open. Waraqa does not keep it, so note it down.</p>}
                    <label className="switch-row">
                      <span><I.Compress size={18} /> Smaller file (lower quality)</span>
                      <input type="checkbox" checked={!!opts.compress} onChange={(e) => setOpts({ ...opts, compress: e.target.checked })} />
                    </label>
                  </>
                )}
                {sheet.focus === "print" ? busyBtn("Print", print) : (
                  <div className="row-2">
                    {shareOk ? busyBtn("Share", sharePdf, false) : busyBtn("Print", print, false)}
                    {busyBtn("Save PDF", exportPdf)}
                  </div>
                )}
                {sheet.focus !== "print" && shareOk && <button className="link-btn" onClick={print} disabled={!!working}><I.Print size={16} /> Print instead</button>}
              </>
            )}

            {sheet.kind === "text" && (
              <>
                {head("Text from scan")}
                {langPick}
                {ocr ? progress : busyBtn(text ? "Read again" : "Read text", runOcr)}
                {text && (
                  <>
                    <textarea id="ocr-text" className="ocr-text" dir="auto" value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} />
                    <div className="row-3">
                      <button className="btn btn-quiet" onClick={copyText}><I.Copy /> Copy</button>
                      <button className="btn btn-quiet" onClick={() => setSheet({ kind: "convert", to: "word" })}><I.Word size={18} /> Word</button>
                      <button className="btn btn-quiet" onClick={() => setSheet({ kind: "convert", to: "excel" })}><I.Excel size={18} /> Excel</button>
                    </div>
                  </>
                )}
                {!text && !ocr && <p className="muted">The first read downloads the language data once (about 3 MB for English, 2 MB for Arabic). Then it works offline.</p>}
              </>
            )}

            {sheet.kind === "translate" && (
              <>
                {head("Translate")}
                <label className="field-row" htmlFor="tr-to">
                  <span><I.Translate size={18} /> Auto detect to</span>
                  <select id="tr-to" className="field" value={translateTo} onChange={(e) => { setTranslateTo(e.target.value); setTranslated(null); }}>
                    {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                {!textPages(text, pages.length).some((t) => t.trim()) && <>{langPick}{ocr ? progress : busyBtn("Read text", runOcr)}</>}
                {ocr && text ? progress : null}
                {text && !ocr && (
                  <>
                    {canTranslateOnDevice() && busyBtn(`Translate to ${targetLabel(translateTo)} on this phone`, doTranslate)}
                    <a className="btn btn-quiet wide" href={onlineTranslateUrl(text.replace(/^— Page \d+ —$/gm, "").trim(), translateTo)} target="_blank" rel="noopener noreferrer">
                      <I.Translate size={18} /> Open in Google Translate
                    </a>
                    <p className="muted small">{canTranslateOnDevice() ? "On this phone keeps the text private. Google Translate sends the text online." : "This phone has no offline translator, so translating opens Google Translate with the text. That sends the text online."}</p>
                  </>
                )}
                {translated !== null && (
                  <>
                    <textarea className="ocr-text" dir="auto" value={translated} onChange={(e) => setTranslated(e.target.value)} />
                    <div className="row-3">
                      <button className="btn btn-quiet" onClick={async () => { try { await navigator.clipboard.writeText(translated); notify({ text: "Translation copied" }); } catch { notify({ text: "Copy is not available here", tone: "error" }); } }}><I.Copy /> Copy</button>
                      <button className="btn btn-quiet" onClick={translatedWord}><I.Word size={18} /> Word</button>
                    </div>
                  </>
                )}
              </>
            )}

            {sheet.kind === "latex" && (
              <>
                {head("Formula to LaTeX")}
                <p className="muted small">Sends the page images to OpenRouter with your key. Crop the page to the formulas first for the best result.</p>
                {latex === null ? busyBtn(pages.length > 1 ? `Read formulas on ${pages.length} pages` : "Read formulas", readLatex) : (
                  <>
                    <textarea className="ocr-text mono" dir="ltr" value={latex} onChange={(e) => setLatex(e.target.value)} />
                    <div className="row-3">
                      <button className="btn btn-quiet" onClick={async () => { try { await navigator.clipboard.writeText(latex); notify({ text: "LaTeX copied" }); } catch { notify({ text: "Copy is not available here", tone: "error" }); } }}><I.Copy /> Copy</button>
                      <button className="btn btn-quiet" onClick={latexWord} disabled={!!working}><I.Word size={18} /> Word</button>
                      <button className="btn btn-quiet" onClick={readLatex} disabled={!!working}><I.Refresh size={18} /> Again</button>
                    </div>
                  </>
                )}
              </>
            )}

            {sheet.kind === "chat" && (
              <>
                {head("AI Chat")}
                <p className="muted small">Asks about this document. Its text and first pages go to OpenRouter with your key.</p>
                <div className="chat-log" aria-live="polite">
                  {!chat.length && <p className="muted">Try “Summarize this”, “What is the due date?” or “Translate the second paragraph”.</p>}
                  {chat.map((m, i) => <p key={i} className={"chat-msg chat-" + m.role} dir="auto">{m.text}</p>)}
                  {working && <p className="chat-msg chat-assistant muted">{working}…</p>}
                  <div ref={chatEnd} />
                </div>
                <form className="chat-ask" onSubmit={(e) => { e.preventDefault(); void sendChat(); }}>
                  <input className="field" dir="auto" placeholder="Ask about this document" value={ask} onChange={(e) => setAsk(e.target.value)} />
                  <button className="btn btn-primary" type="submit" disabled={!ask.trim() || !!working}>Send</button>
                </form>
              </>
            )}

            {sheet.kind === "questions" && (
              <>
                {head("Incorrect Question")}
                {!textPages(text, pages.length).some((t) => t.trim()) && <>{langPick}{ocr ? progress : busyBtn("Read the questions", runOcr)}</>}
                {ocr && text ? progress : null}
                {text && !ocr && (
                  <>
                    <p className="muted">Tick the questions you got wrong. {questionList.length} found. Fix the text in Extract Text if a question was split badly.</p>
                    <ul className="q-list">
                      {questionList.map((q, i) => (
                        <li key={i}>
                          <label className={"q-row" + (wrong.has(i) ? " on" : "")}>
                            <input type="checkbox" checked={wrong.has(i)} onChange={() => setWrong((w) => { const n = new Set(w); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                            <span dir="auto">{q.length > 240 ? q.slice(0, 240) + "…" : q}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {busyBtn(wrong.size ? `Save review sheet (${wrong.size})` : "Tick at least one question", saveReview)}
                  </>
                )}
              </>
            )}

            {sheet.kind === "convert" && (
              <>
                {head(sheet.to === "word" ? "To Word" : sheet.to === "excel" ? "To Excel" : "To PowerPoint")}
                <p className="muted">
                  {sheet.to === "word" && "Reads the text and saves an editable Word file, one section per page."}
                  {sheet.to === "excel" && "Reads the text and puts it in rows and columns, one sheet per page. Simple tables come out best, so check the numbers."}
                  {sheet.to === "pptx" && "One slide per page with the page image. Read text goes in the slide notes."}
                </p>
                {sheet.to !== "pptx" && !textPages(text, pages.length).some((t) => t.trim()) && langPick}
                {sheet.to === "word" && (
                  <label className="switch-row">
                    <span>Include the page images</span>
                    <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
                  </label>
                )}
                {progress}
                {busyBtn(sheet.to === "word" ? "Make Word file" : sheet.to === "excel" ? "Make Excel file" : "Make slides", () => convert(sheet.to))}
              </>
            )}

            {sheet.kind === "pick" && (
              <>
                {head("Which page?")}
                <div className="pick-grid">
                  {pages.map((p, i) => (
                    <button key={p.id} className="pick-card" onClick={() => pickedPage(sheet.then, i)}>
                      <img src={p.thumb} alt={`Page ${i + 1}`} /><span className="mono">{i + 1}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet.kind === "extract" && (
              <>
                {head("Extract pages")}
                <p className="muted">Pick pages to copy into a new document. This one stays as it is.</p>
                <div className="pick-grid">
                  {pages.map((p, i) => {
                    const on = picks.has(i);
                    return (
                      <button key={p.id} className={"pick-card" + (on ? " on" : "")} aria-pressed={on}
                        onClick={() => { const s = new Set(picks); if (on) s.delete(i); else s.add(i); setPicks(s); }}>
                        <img src={p.thumb} alt={`Page ${i + 1}`} /><span className="mono">{i + 1}</span>
                        {on && <span className="tick on"><I.Check size={14} /></span>}
                      </button>
                    );
                  })}
                </div>
                <button className="btn btn-primary wide" onClick={extract} disabled={!picks.size}>
                  {picks.size ? `Make new document with ${picks.size}` : "Pick pages"}
                </button>
              </>
            )}

            {sheet.kind === "reorder" && (
              <>
                {head("Reorder pages")}
                <ol className="reorder">
                  {pages.map((p, i) => (
                    <li key={p.id}>
                      <img src={p.thumb} alt="" />
                      <span className="mono">{i + 1}</span>
                      <button className="icon-btn" onClick={() => move(i, i - 1, false)} disabled={i === 0} aria-label="Move up"><span className="rot-up"><I.Left /></span></button>
                      <button className="icon-btn" onClick={() => move(i, i + 1, false)} disabled={i === pages.length - 1} aria-label="Move down"><span className="rot-down"><I.Left /></span></button>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {sheet.kind === "merge" && <MergePicker rev={rev} self={doc.id} working={!!working} onPick={mergeFrom} onClose={close} />}

            {sheet.kind === "tags" && (
              <>
                {head("Tags and folder")}
                <div className="chips wrap">
                  {TAGS.map((t) => (
                    <button key={t} className={"chip-btn" + (doc.tags?.includes(t) ? " on" : "")} onClick={() => toggleTag(t)}><I.Tag size={14} /> {t}</button>
                  ))}
                </div>
                <div className="chips wrap">
                  <button className={"chip-btn" + (!doc.folderId ? " on" : "")} onClick={() => save({ ...doc, folderId: undefined })}>No folder</button>
                  {folders.map((f) => (
                    <button key={f.id} className={"chip-btn" + (doc.folderId === f.id ? " on" : "")} onClick={() => save({ ...doc, folderId: f.id })}><I.Folder size={14} /> {f.name}</button>
                  ))}
                </div>
                {!folders.length && <p className="muted small">Make folders on the Documents tab.</p>}
              </>
            )}

            {sheet.kind === "delete" && (
              <>
                <div className="sheet-head"><h2>Delete “{doc.name}”?</h2></div>
                <p className="muted">All {pages.length} pages and the read text are removed from this phone. This cannot be undone.</p>
                <div className="row-2">
                  <button className="btn btn-quiet" onClick={close}>Keep it</button>
                  <button className="btn btn-danger" onClick={async () => { await deleteDoc(doc.id); onChanged(); onBack(); }}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {working && !sheet && (
        <div className="busy" role="status" aria-live="polite"><div className="busy-card"><span className="spinner" />{working}</div></div>
      )}
    </>
  );
}

function MergePicker({ rev, self, working, onPick, onClose }: { rev: number; self: string; working: boolean; onPick(id: string): void; onClose(): void }) {
  const { rows } = useDocs(rev);
  const others = (rows ?? []).filter((r) => r.doc.id !== self && r.doc.pageIds.length);
  return (
    <>
      <div className="sheet-head">
        <h2>Add pages from</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><I.Close /></button>
      </div>
      {rows && !others.length && <p className="muted">There is no other document to merge yet.</p>}
      <ul className="doc-list">
        {others.map(({ doc, thumb }) => (
          <li key={doc.id}>
            <button className="doc-row" onClick={() => onPick(doc.id)} disabled={working}>
              <span className="doc-thumb">{thumb ? <img src={thumb} alt="" /> : <I.Pdf />}</span>
              <span className="doc-meta"><span className="doc-name">{doc.name}</span><span className="doc-sub mono">{doc.pageIds.length} pages</span></span>
              <I.Plus />
            </button>
          </li>
        ))}
      </ul>
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
