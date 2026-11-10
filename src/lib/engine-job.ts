// One image job. Runs in a worker from the UI, and directly in tests.
import { detectPage, type Detection } from "./detect";
import type { Adjust, FilterKind } from "./filters";
import type { Quad, Raster } from "./geometry";
import { flatten, flattenDeglare, finish } from "./pipeline";
import { colorize, countObjects, type Counted, eraseMarks, idCardSheet, inpaint, photoSheet, PHOTO_SIZES, restorePhoto, splitSpread, stackPages, stitchVertical, whiteboard } from "./imaging";

export type ToolOp = "eraseMarks" | "restore" | "whiteboard" | "colorize";

export type Job =
  | { op: "detect"; src: Raster }
  | { op: "flatten"; src: Raster; quad: Quad; rotation: number; maxSide?: number }
  | { op: "finish"; src: Raster; filter: FilterKind; adjust: Adjust }
  | { op: "tool"; src: Raster; tool: ToolOp }
  | { op: "inpaint"; src: Raster; mask: Uint8Array }
  | { op: "split"; src: Raster }
  | { op: "stitch"; src: Raster; more: Raster[] }
  | { op: "deglare"; src: Raster; more: Raster[]; quads: Quad[]; maxSide?: number }
  | { op: "stack"; src: Raster; more: Raster[] }
  | { op: "idcard"; src: Raster; more: Raster[]; paper: "letter" | "a4"; card?: [number, number] }
  | { op: "count"; src: Raster; sensitivity: number }
  | { op: "idphoto"; src: Raster; size: string };

export interface JobResult {
  raster?: Raster;
  rasters?: Raster[];
  detection?: Detection;
  counted?: { items: Counted[]; total: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function runJob(job: Job, cv: any): JobResult {
  switch (job.op) {
    case "detect": return { detection: detectPage(cv, job.src) };
    case "flatten": return { raster: flatten(job.src, job.quad, job.rotation, job.maxSide) };
    case "finish": return { raster: finish(job.src, job.filter, job.adjust) };
    case "tool": {
      const f = { eraseMarks, restore: restorePhoto, whiteboard, colorize }[job.tool];
      return { raster: f(job.src) };
    }
    case "inpaint": return { raster: inpaint(job.src, job.mask) };
    case "split": return { rasters: splitSpread(job.src) };
    case "stitch": return { raster: stitchVertical([job.src, ...job.more]) };
    case "deglare": return { raster: flattenDeglare([job.src, ...job.more], job.quads, job.maxSide) };
    case "stack": return { raster: stackPages([job.src, ...job.more]) };
    case "idcard": return { raster: idCardSheet([job.src, ...job.more], job.paper, job.card) };
    case "count": return { counted: countObjects(job.src, job.sensitivity) };
    case "idphoto": {
      const size = PHOTO_SIZES.find((s) => s.id === job.size) ?? PHOTO_SIZES[0];
      const r = photoSheet(job.src, size);
      return { rasters: [r.single, r.sheet] };
    }
  }
}
