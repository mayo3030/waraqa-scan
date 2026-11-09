// Background thread for OpenCV startup, page finding, flattening and filters.
// None of that may run on the UI thread: on a phone it freezes the app
// (Android then says it is not responding).
import { runJob, type Job, type JobResult } from "./engine-job";

type Request = Job & { id: number };

interface Response extends JobResult {
  id: number;
  ok: boolean;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<Request>) => void) | null;
  postMessage(msg: Response, transfer?: Transferable[]): void;
  importScripts(...urls: string[]): void;
  cv?: { Mat?: unknown; onRuntimeInitialized?: () => void; then?: (fn: (cv: unknown) => void) => unknown };
};

let cvLoading: Promise<void> | null = null;

try {
  const here = (self as unknown as { location: { href: string } }).location.href;
  // Absolute path so this works both from /assets/<worker>.js and from dev.
  scope.importScripts(new URL("/vendor/opencv.js", here).href);
} catch { /* detect reports that the page finder did not start */ }

// Resolves when OpenCV can be used. The module object has a `.then` that never
// settles, so this promise must not fulfill *with* that object or the caller
// waits forever.
function loadOpenCv(): Promise<void> {
  if (cvLoading) return cvLoading;
  cvLoading = new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const cv = scope.cv;
      if (cv?.Mat) { resolve(); return; }
      if (!cv && Date.now() - started > 1000) { reject(new Error("Page finder file is missing")); return; }
      if (Date.now() - started > 30000) { reject(new Error("OpenCV took too long to start")); return; }
      setTimeout(poll, 200);
    };
    setTimeout(poll, 200);
  });
  cvLoading.catch(() => { cvLoading = null; });
  return cvLoading;
}

let chain = Promise.resolve();

scope.onmessage = (ev) => {
  const msg = ev.data;
  chain = chain.then(async () => {
    try {
      if (msg.op === "detect") await loadOpenCv();
      const result = runJob(msg, msg.op === "detect" ? scope.cv : null);
      const transfer: Transferable[] = [];
      if (result.raster) transfer.push(result.raster.data.buffer);
      scope.postMessage({ id: msg.id, ok: true, ...result }, transfer);
    } catch (e) {
      scope.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }).catch(() => {});
};
