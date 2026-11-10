// Text extraction with Tesseract.js, served from the app's own files.
import { Capacitor } from "@capacitor/core";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { assetUrl } from "./cvload";
import { tesseractOptions } from "./ocr-config";
import { withTimeout } from "./timeout";
import { fixVins } from "./vin";

export type OcrLang = "eng" | "ara" | "eng+ara";
export const OCR_LANGS: { id: OcrLang; label: string }[] = [
  { id: "eng", label: "English" },
  { id: "ara", label: "العربية" },
  { id: "eng+ara", label: "Both" },
];

let current: { lang: OcrLang; worker: Promise<Worker> } | null = null;
let onProgress: (p: { status: string; progress: number }) => void = () => {};

function getWorker(lang: OcrLang) {
  if (current?.lang === lang) return current.worker;
  current?.worker.then((w) => w.terminate()).catch(() => {});
  const opt = tesseractOptions(Capacitor.isNativePlatform());
  const worker = createWorker(lang.split("+"), OEM.LSTM_ONLY, {
    workerPath: assetUrl("vendor/tesseract/worker.min.js"),
    corePath: assetUrl(opt.corePath),
    langPath: assetUrl("vendor/tesseract/lang"),
    workerBlobURL: false,
    gzip: opt.gzip,
    ...(opt.cacheMethod ? { cacheMethod: opt.cacheMethod } : {}),
    // Tesseract also throws from its message handler when a job fails, which
    // the app treats as a fatal error on top of the rejected promise.
    errorHandler: () => {},
    logger: (m: { status: string; progress: number }) => onProgress(m),
  });
  current = { lang, worker };
  worker.catch(() => { if (current?.worker === worker) current = null; });
  return worker;
}

const START_MS = 60000;
const PAGE_MS = 120000;

function giveUp(pending: Promise<Worker>) {
  if (current?.worker === pending) current = null;
  pending.then((w) => w.terminate()).catch(() => {});
}

/** A word with its box in image pixels: left, top, right, bottom. Top and bottom are the line's, so a line shares one baseline. */
export type WordBox = [string, number, number, number, number];
export interface PageText { text: string; words: WordBox[] }

/* eslint-disable @typescript-eslint/no-explicit-any */
function wordsOf(data: any): WordBox[] {
  const out: WordBox[] = [];
  for (const b of data?.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const lb = l.bbox;
    for (const w of l.words ?? []) {
      const t = String(w.text ?? "").trim();
      if (t && w.bbox && lb) out.push([t, w.bbox.x0, lb.y0, w.bbox.x1, lb.y1]);
    }
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Reads each image and also returns where every word sits. */
export async function recognizeDetailed(
  images: Blob[],
  lang: OcrLang,
  progress: (label: string, value: number) => void,
): Promise<PageText[]> {
  const pending = getWorker(lang);
  let w: Worker;
  try {
    w = await withTimeout(pending, START_MS, "Text reading took too long to start");
  } catch (e) {
    giveUp(pending);
    throw e;
  }
  const out: PageText[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      const n = images.length;
      onProgress = (m) => {
        const step = m.status.startsWith("recognizing") ? m.progress : 0;
        const label = m.status.startsWith("recognizing")
          ? `Reading page ${i + 1} of ${n}`
          : m.status.includes("load") ? "Loading language data" : "Starting";
        progress(label, (i + step) / n);
      };
      // Single column mode keeps large headings that auto mode tends to drop.
      await withTimeout(w.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        preserve_interword_spaces: lang === "eng" ? "0" : "1",
      }), START_MS, "Text reading took too long to start");
      const r = await withTimeout(w.recognize(images[i], {}, { text: true, blocks: true }), PAGE_MS, "Text reading took too long");
      out.push({ text: fixVins(r.data.text.trim()), words: wordsOf(r.data) });
    }
  } catch (e) {
    giveUp(pending);
    throw e;
  }
  progress("Done", 1);
  return out;
}

export async function recognize(
  images: Blob[],
  lang: OcrLang,
  progress: (label: string, value: number) => void,
): Promise<string[]> {
  return (await recognizeDetailed(images, lang, progress)).map((p) => p.text);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fallback for the Claude page viewer: when the on-device reader cannot
 * start there, ask Claude to read the page images instead (the viewer is
 * asked for permission first).
 */
export async function recognizeWithClaude(
  images: Blob[],
  lang: OcrLang,
  progress: (label: string, value: number) => void,
): Promise<string[] | null> {
  const c = (window as any).claude;
  if (!c?.use) return null;
  const sample = await c.use("sample").catch(() => null);
  if (!sample) return null;
  const lim = await sample.limits().catch(() => null);
  if (!lim?.images) return null;
  const want = lang === "ara" ? "Arabic" : lang === "eng" ? "English" : "Arabic and English";
  const out: string[] = [];
  for (let i = 0; i < images.length; i++) {
    progress(`Reading page ${i + 1} of ${images.length}`, i / images.length);
    const r = await sample(
      `The image is one scanned document page. Transcribe all of its text exactly, in reading order, keeping line breaks. ` +
        `The text is mostly ${want}. Output only the transcription, with no comments or formatting marks.`,
      { images: [images[i]], modelTier: "default", cache: false },
    );
    out.push(String(r.text).trim());
  }
  progress("Done", 1);
  return out;
}
