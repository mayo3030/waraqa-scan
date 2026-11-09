// Browser image helpers: files <-> rasters <-> blobs.
import type { Raster } from "./geometry";
import { withTimeout } from "./timeout";

function imageSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth, h: img.naturalHeight };
  const sized = img as { width?: number; height?: number };
  return { w: sized.width ?? 0, h: sized.height ?? 0 };
}

// createImageBitmap never settles on some Android WebViews (the scan screen
// then stays on "Finding the page edges"). An <img> decode is the fallback.
async function decodeImage(blob: Blob): Promise<{ img: CanvasImageSource; url?: string }> {
  if (typeof createImageBitmap === "function") {
    try {
      const img = await withTimeout(
        createImageBitmap(blob, { imageOrientation: "from-image" }).catch(() => createImageBitmap(blob)),
        8000,
        "Photo took too long to open",
      );
      return { img };
    } catch { /* try the image element */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await withTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file could not be opened as a photo"));
      el.src = url;
    }), 15000, "Photo took too long to open");
    return { img, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function blobToRaster(blob: Blob, maxSide = 2400): Promise<Raster> {
  const decoded = await decodeImage(blob);
  try {
    const size = imageSize(decoded.img);
    const s = Math.min(1, maxSide / Math.max(size.w, size.h));
    const w = Math.max(1, Math.round(size.w * s)), h = Math.max(1, Math.round(size.h * s));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(decoded.img, 0, 0, w, h);
    if ("close" in decoded.img && typeof decoded.img.close === "function") decoded.img.close();
    const id = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: id.data };
  } finally {
    if (decoded.url) URL.revokeObjectURL(decoded.url);
  }
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
