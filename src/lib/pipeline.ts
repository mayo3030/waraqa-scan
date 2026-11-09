// The full page pipeline: corners -> flat page -> rotation -> filter.
import { outputSize, rotate90, warpPerspective, type Quad, type Raster } from "./geometry";
import { applyFilter, type Adjust, type FilterKind } from "./filters";

export function flatten(src: Raster, quad: Quad, rotation: number, maxSide = 2000): Raster {
  const { w, h } = outputSize(quad, maxSide);
  return rotate90(warpPerspective(src, quad, w, h), rotation);
}

export function finish(flat: Raster, filter: FilterKind, adjust: Adjust): Raster {
  return applyFilter(flat, filter, adjust);
}
