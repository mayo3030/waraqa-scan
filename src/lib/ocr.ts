// Text extraction with Tesseract.js, served from the app's own files.
import { Capacitor } from "@capacitor/core";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { assetUrl } from "./cvload";
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
  const worker = createWorker(lang.split("+"), OEM.LSTM_ONLY, {
    workerPath: assetUrl("vendor/tesseract/worker.min.js"),
    corePath: assetUrl("vendor/tesseract/core"),
    langPath: assetUrl("vendor/tesseract/lang"),
    workerBlobURL: false,
    // Android's build unpacks .gz assets (eng.traineddata.gz -> eng.traineddata),
    // so the app reads plain files there and gzipped files on the web.
    gzip: !Capacitor.isNativePlatform(),
    logger: (m: { status: string; progress: number }) => onProgress(m),
  });
  current = { lang, worker };
  worker.catch(() => { current = null; });
  return worker;
}

export async function recognize(
  images: Blob[],
  lang: OcrLang,
  progress: (label: string, value: number) => void,
): Promise<string[]> {
  const texts: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const n = images.length;
    onProgress = (m) => {
      const step = m.status.startsWith("recognizing") ? m.progress : 0;
      const label = m.status.startsWith("recognizing")
        ? `Reading page ${i + 1} of ${n}`
        : m.status.includes("load") ? "Loading language data" : "Starting";
      progress(label, (i + step) / n);
    };
    const w = await getWorker(lang);
    // Single column mode keeps large headings that auto mode tends to drop.
    await w.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      preserve_interword_spaces: lang === "eng" ? "0" : "1",
    });
    const r = await w.recognize(images[i]);
    texts.push(fixVins(r.data.text.trim()));
  }
  progress("Done", 1);
  return texts;
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
