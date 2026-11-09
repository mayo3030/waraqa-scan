// Browser image helpers: files <-> rasters <-> blobs.
import type { Raster } from "./geometry";

export async function blobToRaster(blob: Blob, maxSide = 2400): Promise<Raster> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    bmp = await createImageBitmap(blob);
  }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: id.data };
}

export function rasterToCanvas(r: Raster, canvas?: HTMLCanvasElement) {
  const c = canvas ?? document.createElement("canvas");
  c.width = r.width; c.height = r.height;
  const ctx = c.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c;
}

export function rasterToBlob(r: Raster, quality = 0.9): Promise<Blob> {
  const c = rasterToCanvas(r);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", quality));
}

export function rasterThumb(r: Raster, max = 360): string {
  const s = Math.min(1, max / Math.max(r.width, r.height));
  const src = rasterToCanvas(r);
  const c = document.createElement("canvas");
  c.width = Math.round(r.width * s); c.height = Math.round(r.height * s);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

/** Downscales a raster (box filter via canvas) for fast previews. */
export function shrink(r: Raster, max: number): Raster {
  const s = Math.min(1, max / Math.max(r.width, r.height));
  if (s === 1) return r;
  const src = rasterToCanvas(r);
  const c = document.createElement("canvas");
  c.width = Math.round(r.width * s); c.height = Math.round(r.height * s);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
}
