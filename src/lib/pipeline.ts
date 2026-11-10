// The full page pipeline: corners -> flat page -> rotation -> filter.
import { outputSize, rotate90, warpPerspective, type Quad, type Raster } from "./geometry";
import { applyFilter, type Adjust, type FilterKind } from "./filters";
import { mergeGlare } from "./deglare";

/** Pages smaller than this on their long side are enlarged (up to 1.6 times) for crisper text. */
export const MIN_SIDE = 1400;

/** Size of the flat page for these corners. */
export function flatSize(quad: Quad, maxSide = 2000): { w: number; h: number } {
  let { w, h } = outputSize(quad, maxSide);
  const long = Math.max(w, h);
  if (long < MIN_SIDE) {
    const k = Math.min(1.6, MIN_SIDE / long);
    w = Math.round(w * k); h = Math.round(h * k);
  }
  return { w, h };
}

export function flatten(src: Raster, quad: Quad, rotation: number, maxSide = 2000): Raster {
  const { w, h } = flatSize(quad, maxSide);
  return rotate90(warpPerspective(src, quad, w, h), rotation);
}

/**
 * Two or more photos of the same card, each with its own corners, flattened to one size and
 * joined so flash glare in one photo is filled from another.
 */
export function flattenDeglare(srcs: Raster[], quads: Quad[], maxSide = 2000): Raster {
  const { w, h } = flatSize(quads[0], maxSide);
  return mergeGlare(srcs.map((s, i) => warpPerspective(s, quads[i], w, h)));
}

export function finish(flat: Raster, filter: FilterKind, adjust: Adjust): Raster {
  return applyFilter(flat, filter, adjust);
}
