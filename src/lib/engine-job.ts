// One image job. Runs in a worker from the UI, and directly in tests.
import { detectPage, type Detection } from "./detect";
import type { Adjust, FilterKind } from "./filters";
import type { Quad, Raster } from "./geometry";
import { flatten, finish } from "./pipeline";

export type Job =
  | { op: "detect"; src: Raster }
  | { op: "flatten"; src: Raster; quad: Quad; rotation: number }
  | { op: "finish"; src: Raster; filter: FilterKind; adjust: Adjust };

export interface JobResult {
  raster?: Raster;
  detection?: Detection;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function runJob(job: Job, cv: any): JobResult {
  if (job.op === "detect") return { detection: detectPage(cv, job.src) };
  if (job.op === "flatten") return { raster: flatten(job.src, job.quad, job.rotation) };
  return { raster: finish(job.src, job.filter, job.adjust) };
}
