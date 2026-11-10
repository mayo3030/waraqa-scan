// Puts an AI cut-out (a PNG with a see-through background) on a new background.
import type { Raster } from "./geometry";

export const BG_CHOICES: { id: string; label: string; color: string }[] = [
  { id: "none", label: "See-through", color: "none" },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "blue", label: "Blue", color: "#2f6bd8" },
  { id: "sky", label: "Light blue", color: "#cfe3ff" },
  { id: "red", label: "Red", color: "#d42a2a" },
  { id: "gray", label: "Gray", color: "#e6e6e6" },
];

function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The cut-out laid over a solid colour; soft edges (hair, fur) blend into it. */
export function cutoutOn(src: Raster, color: string): Raster {
  const [br, bg, bb] = hex(color);
  const d = src.data, out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    out[i] = d[i] * a + br * (1 - a);
    out[i + 1] = d[i + 1] * a + bg * (1 - a);
    out[i + 2] = d[i + 2] * a + bb * (1 - a);
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

/** PNG keeps the see-through background (JPEG cannot). */
export function rasterToPng(r: Raster): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = r.width; c.height = r.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG could not be made"))), "image/png"));
}
