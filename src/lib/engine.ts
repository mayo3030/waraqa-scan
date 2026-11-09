// Sends page finding and image work to a worker. If the worker cannot start,
// the same functions run here after a paint, which is the old path.
import { loadOpenCV } from "./cvload";
import { detectPage, type Detection } from "./detect";
import { runJob, type Job, type JobResult } from "./engine-job";
import type { Adjust, FilterKind } from "./filters";
import type { Quad, Raster } from "./geometry";
import { withTimeout, yieldToPaint } from "./timeout";

interface Response extends JobResult {
  id: number;
  ok: boolean;
  error?: string;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve(r: JobResult): void; reject(e: Error): void }>();

function dropWorker(err: Error) {
  const all = [...pending.values()];
  pending.clear();
  const w = worker;
  worker = null;
  if (w) w.onerror = null;
  for (const p of all) p.reject(err);
  w?.terminate();
}

function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./engine.worker.ts", import.meta.url));
  } catch {
    return null;
  }
  worker.onmessage = (ev: MessageEvent<Response>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    pending.delete(ev.data.id);
    if (ev.data.ok) p.resolve(ev.data);
    else p.reject(new Error(ev.data.error || "Page tools failed"));
  };
  worker.onerror = () => {
    dropWorker(new Error("Page tools stopped"));
  };
  return worker;
}

function copyRaster(src: Raster): Raster {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

function asRaster(r: Raster): Raster {
  const data = r.data instanceof Uint8ClampedArray ? r.data : new Uint8ClampedArray(r.data);
  return { width: r.width, height: r.height, data };
}

function ask(job: Job, ms: number): Promise<JobResult> {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error("no worker"));
  const id = ++seq;
  const src = copyRaster(job.src);
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled || !pending.has(id)) return;
      settled = true;
      pending.delete(id);
      // A stuck job would block every later one, so drop the worker.
      dropWorker(new Error("Page tools took too long"));
      reject(new Error("Page tools took too long"));
    }, ms);
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      pending.delete(id);
      fn();
    };
    pending.set(id, {
      resolve: (r) => settle(() => resolve(r)),
      reject: (e) => settle(() => reject(e)),
    });
    try {
      w.postMessage({ ...job, id, src }, [src.data.buffer]);
    } catch (e) {
      settle(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

async function locally(job: Job): Promise<JobResult> {
  await yieldToPaint();
  if (job.op === "detect") {
    const cv = await withTimeout(loadOpenCV(), 30000, "OpenCV took too long to start");
    await yieldToPaint();
    return { detection: detectPage(cv, job.src) };
  }
  return runJob(job, null);
}

export async function detectAsync(src: Raster): Promise<Detection> {
  // Only the no-Worker case may run OpenCV on the UI thread. A failed or slow
  // worker must not fall back there: that is the freeze we are avoiding.
  // The screen already lets the person place the corners by hand.
  if (typeof Worker === "undefined") {
    const r = await locally({ op: "detect", src });
    if (!r.detection) throw new Error("No page outline");
    return r.detection;
  }
  const r = await ask({ op: "detect", src }, 45000);
  if (!r.detection) throw new Error("No page outline");
  return r.detection;
}

export async function flattenAsync(src: Raster, quad: Quad, rotation: number): Promise<Raster> {
  try {
    const r = await ask({ op: "flatten", src, quad, rotation }, 20000);
    if (!r.raster) throw new Error("No image");
    return asRaster(r.raster);
  } catch {
    const r = await locally({ op: "flatten", src, quad, rotation });
    return r.raster!;
  }
}

export async function finishAsync(src: Raster, filter: FilterKind, adjust: Adjust): Promise<Raster> {
  try {
    const r = await ask({ op: "finish", src, filter, adjust }, 20000);
    if (!r.raster) throw new Error("No image");
    return asRaster(r.raster);
  } catch {
    const r = await locally({ op: "finish", src, filter, adjust });
    return r.raster!;
  }
}
