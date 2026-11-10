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

/** A page from an image already encoded on a canvas (see finishCanvas). */
export function pageFromImage(img: { blob: Blob; thumb: string; width: number; height: number }): Omit<PageRec, "id" | "docId"> {
  return {
    original: img.blob,
    quad: fullQuad(img.width, img.height, 0),
    rotation: 0,
    filter: "original",
    adjust: NO_ADJUST,
    result: img.blob,
    thumb: img.thumb,
    width: img.width,
    height: img.height,
  };
}
