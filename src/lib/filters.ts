// Page filters on raw RGBA rasters. Pure functions, no DOM.
import type { Raster } from "./geometry";

export type FilterKind = "original" | "enhance" | "gray" | "bw";

export const FILTERS: { id: FilterKind; label: string; hint: string }[] = [
  { id: "enhance", label: "Clean", hint: "White paper, sharp ink, keeps color" },
  { id: "original", label: "Original", hint: "As photographed" },
  { id: "gray", label: "Grayscale", hint: "Soft gray tones" },
  { id: "bw", label: "B&W", hint: "Pure black text on white" },
];

export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0 };

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Integral image of luminance, (w+1) x (h+1). */
function integralLum(src: Raster) {
  const { width: w, height: h, data } = src;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row += lum(data[i], data[i + 1], data[i + 2]);
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

function boxMean(I: Float64Array, w: number, h: number, x: number, y: number, r: number) {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
  return s / ((x1 - x0) * (y1 - y0));
}

/**
 * Estimates the paper brightness around each pixel: a coarse grid of the
 * brightest values (90th percentile) per cell, smoothed and upsampled.
 */
function paperLevel(src: Raster) {
  const { width: w, height: h, data } = src;
  const cell = Math.max(8, Math.round(Math.max(w, h) / 40));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      let n = 0;
      const ys = gy * cell, xs = gx * cell;
      const ye = Math.min(h, ys + cell), xe = Math.min(w, xs + cell);
      for (let y = ys; y < ye; y += 2) {
        for (let x = xs; x < xe; x += 2) {
          const i = (y * w + x) * 4;
          hist[lum(data[i], data[i + 1], data[i + 2]) | 0]++;
          n++;
        }
      }
      let target = n * 0.9, acc = 0, v = 255;
      for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= target) { v = k; break; } }
      grid[gy * gw + gx] = Math.max(v, 40);
    }
  }
  // smooth grid with a 3x3 max then 3x3 mean
  const sm = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = gy + dy, xx = gx + dx;
      if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
      s += grid[yy * gw + xx]; c++;
    }
    sm[gy * gw + gx] = Math.max(grid[gy * gw + gx], s / c);
  }
  return (x: number, y: number) => {
    const fx = Math.min(gw - 1.001, Math.max(0, x / cell - 0.5));
    const fy = Math.min(gh - 1.001, Math.max(0, y / cell - 0.5));
    const x0 = fx | 0, y0 = fy | 0;
    const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const ax = fx - x0, ay = fy - y0;
    const a = sm[y0 * gw + x0] + (sm[y0 * gw + x1] - sm[y0 * gw + x0]) * ax;
    const b = sm[y1 * gw + x0] + (sm[y1 * gw + x1] - sm[y1 * gw + x0]) * ax;
    return a + (b - a) * ay;
  };
}

function enhance(src: Raster): Raster {
  const { width: w, height: h, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const paper = paperLevel(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = paper(x, y);
      const k = 255 / p;
      for (let c = 0; c < 3; c++) {
        // divide out uneven lighting, then push ink darker
        let v = data[i + c] * k;
        v = 255 - (255 - Math.min(255, v)) * 1.35;
        out[i + c] = v;
      }
      out[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

function gray(src: Raster): Raster {
  const out = new Uint8ClampedArray(src.data.length);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = lum(d[i], d[i + 1], d[i + 2]);
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

/** Adaptive (local mean) threshold after lighting correction. */
function bw(src: Raster): Raster {
  const flat = enhance(src);
  const { width: w, height: h, data } = flat;
  const I = integralLum(flat);
  const r = Math.max(7, Math.round(Math.max(w, h) / 50));
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = lum(data[i], data[i + 1], data[i + 2]);
      const m = boxMean(I, w, h, x, y, r);
      const ink = v < m * 0.88 && v < 200;
      const o = ink ? 0 : 255;
      out[i] = out[i + 1] = out[i + 2] = o;
      out[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

function adjust(src: Raster, a: Adjust): Raster {
  if (!a.brightness && !a.contrast) return src;
  const c = a.contrast * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  const b = a.brightness * 1.28;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = f * (v - 128) + 128 + b;
  const d = src.data;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    out[i] = lut[d[i]]; out[i + 1] = lut[d[i + 1]]; out[i + 2] = lut[d[i + 2]]; out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

export function applyFilter(src: Raster, kind: FilterKind, a: Adjust = NO_ADJUST): Raster {
  let r: Raster;
  switch (kind) {
    case "enhance": r = enhance(src); break;
    case "gray": r = gray(src); break;
    case "bw": r = bw(src); break;
    default: r = src;
  }
  return adjust(r, a);
}
