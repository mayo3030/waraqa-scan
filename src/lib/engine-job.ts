// One image job. Runs in a worker from the UI, and directly in tests.
import { detectPage, type Detection } from "./detect";
import type { Adjust, FilterKind } from "./filters";
import type { Quad, Raster } from "./geometry";
import { flatten, finish } from "./pipeline";
import { eraseMarks, idCardSheet, inpaint, photoSheet, PHOTO_SIZES, restorePhoto, splitSpread, stackPages, stitchVertical, whiteboard } from "./imaging";

export type ToolOp = "eraseMarks" | "restore" | "whiteboard";

export type Job =
  | { op: "detect"; src: Raster }
  | { op: "flatten"; src: Raster; quad: Quad; rotation: number; maxSide?: number }
  | { op: "finish"; src: Raster; filter: FilterKind; adjust: Adjust }
  | { op: "tool"; src: Raster; tool: ToolOp }
  | { op: "inpaint"; src: Raster; mask: Uint8Array }
  | { op: "split"; src: Raster }
  | { op: "stitch"; src: Raster; more: Raster[] }
  | { op: "stack"; src: Raster; more: Raster[] }
  | { op: "idcard"; src: Raster; more: Raster[]; paper: "letter" | "a4" }
  | { op: "idphoto"; src: Raster; size: string };

export interface JobResult {
  raster?: Raster;
  rasters?: Raster[];
  detection?: Detection;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function runJob(job: Job, cv: any): JobResult {
  switch (job.op) {
    case "detect": return { detection: detectPage(cv, job.src) };
    case "flatten": return { raster: flatten(job.src, job.quad, job.rotation, job.maxSide) };
    case "finish": return { raster: finish(job.src, job.filter, job.adjust) };
    case "tool": {
      const f = job.tool === "eraseMarks" ? eraseMarks : job.tool === "restore" ? restorePhoto : whiteboard;
      return { raster: f(job.src) };
    }
    case "inpaint": return { raster: inpaint(job.src, job.mask) };
    case "split": return { rasters: splitSpread(job.src) };
    case "stitch": return { raster: stitchVertical([job.src, ...job.more]) };
    case "stack": return { raster: stackPages([job.src, ...job.more]) };
    case "idcard": return { raster: idCardSheet([job.src, ...job.more], job.paper) };
    case "idphoto": {
      const size = PHOTO_SIZES.find((s) => s.id === job.size) ?? PHOTO_SIZES[0];
      const r = photoSheet(job.src, size);
      return { rasters: [r.single, r.sheet] };
    }
  }
}
