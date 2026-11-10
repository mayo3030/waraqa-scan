// Turns finished images into stored pages.
import { fullQuad, type Raster } from "./geometry";
import { NO_ADJUST } from "./filters";
import { rasterThumb, rasterToBlob } from "./io";
import type { PageRec } from "./store";

/** A page whose photo is the finished image itself (imports, sheets, edits). */
export async function pageFromRaster(r: Raster, quality = 0.9): Promise<Omit<PageRec, "id" | "docId">> {
  const result = await rasterToBlob(r, quality);
  return {
    original: result,
    quad: fullQuad(r.width, r.height, 0),
    rotation: 0,
    filter: "original",
    adjust: NO_ADJUST,
    result,
    thumb: rasterThumb(r),
    width: r.width,
    height: r.height,
  };
}
