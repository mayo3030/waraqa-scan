// The full page pipeline: corners -> flat page -> rotation -> filter.
import { outputSize, rotate90, warpPerspective, type Quad, type Raster } from "./geometry";
import { applyFilter, type Adjust, type FilterKind } from "./filters";

/** Pages smaller than this on their long side are enlarged (up to 1.6 times) for crisper text. */
export const MIN_SIDE = 1400;

export function flatten(src: Raster, quad: Quad, rotation: number, maxSide = 2000): Raster {
  let { w, h } = outputSize(quad, maxSide);
  const long = Math.max(w, h);
  if (long < MIN_SIDE) {
    const k = Math.min(1.6, MIN_SIDE / long);
    w = Math.round(w * k); h = Math.round(h * k);
  }
  return rotate90(warpPerspective(src, quad, w, h), rotation);
}

export function finish(flat: Raster, filter: FilterKind, adjust: Adjust): Raster {
  return applyFilter(flat, filter, adjust);
}
