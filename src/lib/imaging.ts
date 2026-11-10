// Extra page tools on raw RGBA rasters. Pure functions, no DOM, so they run
// in the background worker and in Node tests.
import type { Raster } from "./geometry";

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function blank(width: number, height: number, rgb = 255): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = rgb; data[i + 3] = 255; }
  return { width, height, data };
}

/** Nearest-free bilinear resize. */
export function resize(src: Raster, w: number, h: number): Raster {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(src.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = fy | 0, y1 = Math.min(src.height - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(src.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = fx | 0, x1 = Math.min(src.width - 1, x0 + 1), ax = fx - x0;
      const i00 = (y0 * src.width + x0) * 4, i01 = (y0 * src.width + x1) * 4;
      const i10 = (y1 * src.width + x0) * 4, i11 = (y1 * src.width + x1) * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a = src.data[i00 + c] + (src.data[i01 + c] - src.data[i00 + c]) * ax;
        const b = src.data[i10 + c] + (src.data[i11 + c] - src.data[i10 + c]) * ax;
        out[o + c] = a + (b - a) * ay;
      }
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export function crop(src: Raster, x: number, y: number, w: number, h: number): Raster {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.max(1, Math.min(src.width - x, Math.round(w)));
  h = Math.max(1, Math.min(src.height - y, Math.round(h)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * src.width + x) * 4;
    out.set(src.data.subarray(s, s + w * 4), r * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** Copies `src` into `dst` at (x, y), clipped. */
export function paste(dst: Raster, src: Raster, x: number, y: number) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < src.height; r++) {
    const dy = y + r;
    if (dy < 0 || dy >= dst.height) continue;
    for (let c = 0; c < src.width; c++) {
      const dx = x + c;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (r * src.width + c) * 4, di = (dy * dst.width + dx) * 4;
      dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = 255;
    }
  }
}

/** Largest centered crop with the given width/height ratio. */
export function cropToRatio(src: Raster, ratio: number, cx = 0.5, cy = 0.5): Raster {
  let w = src.width, h = Math.round(w / ratio);
  if (h > src.height) { h = src.height; w = Math.round(h * ratio); }
  const x = Math.min(src.width - w, Math.max(0, src.width * cx - w / 2));
  const y = Math.min(src.height - h, Math.max(0, src.height * cy - h / 2));
  return crop(src, x, y, w, h);
}

// ---- ID cards: both sides at true size on one sheet ----

export const MM_PER_IN = 25.4;
export const SHEET_DPI = 200;
const mm = (v: number) => Math.round((v / MM_PER_IN) * SHEET_DPI);

/** Letter sheet with each card side at 85.6 x 54 mm, stacked and centered. */
export function idCardSheet(sides: Raster[], paper: "letter" | "a4" = "letter"): Raster {
  const [pw, ph] = paper === "a4" ? [210, 297] : [215.9, 279.4];
  const sheet = blank(mm(pw), mm(ph));
  const cw = mm(85.6), ch = mm(54), gap = mm(14);
  const total = sides.length * ch + (sides.length - 1) * gap;
  let y = Math.round((sheet.height - total) / 2.6);
  for (const s of sides) {
    const card = resize(s.width >= s.height ? s : rotate(s), cw, ch);
    outline(sheet, Math.round((sheet.width - cw) / 2) - 1, y - 1, cw + 2, ch + 2, 200);
    paste(sheet, card, (sheet.width - cw) / 2, y);
    y += ch + gap;
  }
  return sheet;
}

function rotate(src: Raster): Raster {
  const { width: w, height: h } = src;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = (x * h + (h - 1 - y)) * 4;
    out[di] = src.data[si]; out[di + 1] = src.data[si + 1]; out[di + 2] = src.data[si + 2]; out[di + 3] = 255;
  }
  return { width: h, height: w, data: out };
}

function outline(r: Raster, x: number, y: number, w: number, h: number, v: number) {
  const set = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= r.width || py >= r.height) return;
    const i = (py * r.width + px) * 4; r.data[i] = r.data[i + 1] = r.data[i + 2] = v;
  };
  for (let i = 0; i < w; i++) { set(x + i, y); set(x + i, y + h - 1); }
  for (let i = 0; i < h; i++) { set(x, y + i); set(x + w - 1, y + i); }
}

// ---- ID photo maker ----

export interface PhotoSize { id: string; label: string; w: number; h: number } // mm
export const PHOTO_SIZES: PhotoSize[] = [
  { id: "2x2", label: "2 x 2 in", w: 51, h: 51 },
  { id: "35x45", label: "35 x 45 mm", w: 35, h: 45 },
  { id: "25x35", label: "25 x 35 mm", w: 25, h: 35 },
  { id: "33x48", label: "33 x 48 mm", w: 33, h: 48 },
  { id: "35x49", label: "35 x 49 mm", w: 35, h: 49 },
];

/** A 4 x 6 inch print sheet filled with copies of the photo, with cut gaps. */
export function photoSheet(photo: Raster, size: PhotoSize): { single: Raster; sheet: Raster } {
  const pw = mm(size.w), ph = mm(size.h);
  const single = resize(cropToRatio(photo, size.w / size.h, 0.5, 0.42), pw, ph);
  const sheet = blank(mm(152.4), mm(101.6)); // 6 x 4 in, landscape
  const gap = mm(3);
  const cols = Math.max(1, Math.floor((sheet.width - gap) / (pw + gap)));
  const rows = Math.max(1, Math.floor((sheet.height - gap) / (ph + gap)));
  const ox = Math.round((sheet.width - (cols * pw + (cols - 1) * gap)) / 2);
  const oy = Math.round((sheet.height - (rows * ph + (rows - 1) * gap)) / 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = ox + c * (pw + gap), y = oy + r * (ph + gap);
    outline(sheet, x - 1, y - 1, pw + 2, ph + 2, 210);
    paste(sheet, single, x, y);
  }
  return { single, sheet };
}

// ---- Book: split a two-page spread at the spine ----

/** Finds the spine (darkest column band near the middle) and splits there. */
export function splitSpread(src: Raster): [Raster, Raster] {
  const { width: w, height: h, data } = src;
  const from = Math.round(w * 0.38), to = Math.round(w * 0.62);
  let best = Math.round(w / 2), bestV = Infinity;
  const step = Math.max(1, Math.round(h / 300));
  for (let x = from; x < to; x++) {
    let s = 0, n = 0;
    for (let y = 0; y < h; y += step) { const i = (y * w + x) * 4; s += lum(data[i], data[i + 1], data[i + 2]); n++; }
    // favour the center slightly so blank spreads split in the middle
    const v = s / n + Math.abs(x - w / 2) * (40 / w);
    if (v < bestV) { bestV = v; best = x; }
  }
  return [crop(src, 0, 0, best, h), crop(src, best, 0, w - best, h)];
}

// ---- Mega scan: stitch overlapping shots top to bottom ----

function grayRows(r: Raster, scaleW: number) {
  const s = resize(r, scaleW, Math.max(2, Math.round((r.height * scaleW) / r.width)));
  const g = new Float32Array(s.width * s.height);
  for (let i = 0; i < g.length; i++) g[i] = lum(s.data[i * 4], s.data[i * 4 + 1], s.data[i * 4 + 2]);
  return { g, w: s.width, h: s.height };
}

/**
 * Overlap (in rows of `b`, at `a`'s width) where the bottom of `a` best
 * matches the top of `b`. Searches 10%..70% of the shorter image.
 */
export function findOverlap(a: Raster, b: Raster): { overlap: number; score: number } {
  const W = 160;
  const A = grayRows(a, W), B = grayRows(resize(b, a.width, Math.round((b.height * a.width) / b.width)), W);
  const minO = Math.max(4, Math.round(Math.min(A.h, B.h) * 0.1));
  const maxO = Math.round(Math.min(A.h, B.h) * 0.7);
  let best = minO, bestS = Infinity;
  for (let o = minO; o <= maxO; o++) {
    let s = 0;
    const step = Math.max(1, Math.round(o / 40));
    let n = 0;
    for (let k = 0; k < o; k += step) {
      const ra = (A.h - o + k) * W, rb = k * W;
      for (let x = 0; x < W; x += 2) { s += Math.abs(A.g[ra + x] - B.g[rb + x]); n++; }
    }
    s /= n;
    if (s < bestS) { bestS = s; best = o; }
  }
  return { overlap: Math.round((best * a.width) / W), score: bestS };
}

/** Joins shots vertically, removing the overlap between neighbours. */
export function stitchVertical(shots: Raster[]): Raster {
  if (!shots.length) throw new Error("No photos to join");
  const W = Math.min(...shots.map((s) => s.width));
  const parts = shots.map((s) => (s.width === W ? s : resize(s, W, Math.round((s.height * W) / s.width))));
  const cuts = [0];
  for (let i = 1; i < parts.length; i++) {
    const { overlap, score } = findOverlap(parts[i - 1], parts[i]);
    // A poor match means the shots do not overlap: keep them whole.
    cuts.push(score < 28 ? overlap : 0);
  }
  const H = parts.reduce((s, p, i) => s + p.height - cuts[i], 0);
  const out = blank(W, H);
  let y = 0;
  parts.forEach((p, i) => {
    const part = cuts[i] ? crop(p, 0, cuts[i], W, p.height - cuts[i]) : p;
    paste(out, part, 0, y);
    y += part.height;
  });
  return out;
}

/** Pages stacked into one tall image (PDF to long image). */
export function stackPages(pages: Raster[], width = 1240, gap = 16): Raster {
  // Phones cannot draw images much taller than ~30,000 px, so narrow long sets.
  const tall = pages.reduce((s, p) => s + p.height / p.width, 0);
  width = Math.max(320, Math.min(width, Math.floor((30000 - gap * pages.length) / Math.max(tall, 0.001))));
  const parts = pages.map((p) => resize(p, width, Math.round((p.height * width) / p.width)));
  const H = parts.reduce((s, p) => s + p.height, 0) + gap * (parts.length - 1);
  const out = blank(width, H, 230);
  let y = 0;
  for (const p of parts) { paste(out, p, 0, y); y += p.height + gap; }
  return out;
}

// ---- Clean-up tools ----

/**
 * Erase marks: removes colored pen, highlighter and stains while keeping
 * dark (black/gray) print.
 */
export function eraseMarks(src: Raster): Raster {
  const d = src.data, out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    const L = lum(r, g, b);
    let v: number;
    if (sat > 0.28 && mx > 60) v = 255; // colored ink or highlight
    else if (L > 185) v = 255; // paper and light shadows
    else v = Math.max(0, (L - 30) * 1.25);
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

/** Restore photo: stretch levels per channel, lift saturation, light sharpen. */
export function restorePhoto(src: Raster): Raster {
  const { width: w, height: h, data: d } = src;
  const lo = [0, 0, 0], hi = [255, 255, 255];
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = c; i < d.length; i += 16) hist[d[i]]++;
    const n = hist.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo[c] = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.01) { hi[c] = v; break; } }
  }
  const lv = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    let r = ((d[i] - lo[0]) * 255) / Math.max(1, hi[0] - lo[0]);
    let g = ((d[i + 1] - lo[1]) * 255) / Math.max(1, hi[1] - lo[1]);
    let b = ((d[i + 2] - lo[2]) * 255) / Math.max(1, hi[2] - lo[2]);
    const L = lum(r, g, b);
    r = L + (r - L) * 1.25; g = L + (g - L) * 1.25; b = L + (b - L) * 1.25;
    lv[i] = r; lv[i + 1] = g; lv[i + 2] = b; lv[i + 3] = 255;
  }
  // unsharp mask with a 3x3 box blur
  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
        s += lv[(yy * w + xx) * 4 + c]; n++;
      }
      out[i + c] = lv[i + c] + (lv[i + c] - s / n) * 0.6;
    }
    out[i + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/** Whiteboard: bright white board, saturated marker strokes. */
export function whiteboard(src: Raster): Raster {
  const d = src.data, out = new Uint8ClampedArray(d.length);
  // board level from the brightest 10% per channel average
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 16) hist[lum(d[i], d[i + 1], d[i + 2]) | 0]++;
  const n = hist.reduce((a, b) => a + b, 0);
  let acc = 0, board = 230;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.35) { board = Math.max(80, v); break; } }
  for (let i = 0; i < d.length; i += 4) {
    const k = 255 / board;
    for (let c = 0; c < 3; c++) {
      const v = Math.min(255, d[i + c] * k);
      out[i + c] = v > 215 ? 255 : 255 - (255 - v) * 1.6;
    }
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

/**
 * Smart erase: fills the masked pixels from their surroundings by repeated
 * neighbour averaging (diffusion), so text or marks blend into the paper.
 * `mask` has one byte per pixel, non-zero where to erase.
 */
export function inpaint(src: Raster, mask: Uint8Array, iterations = 0): Raster {
  const { width: w, height: h } = src;
  const d = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < src.data.length; i += 4, j += 3) { d[j] = src.data[i]; d[j + 1] = src.data[i + 1]; d[j + 2] = src.data[i + 2]; }
  const idx: number[] = [];
  for (let p = 0; p < w * h; p++) if (mask[p]) idx.push(p);
  if (!idx.length) return src;
  // start the hole from the mean of its border
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (const p of idx) {
    const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (!mask[q]) { br += d[q * 3]; bg += d[q * 3 + 1]; bb += d[q * 3 + 2]; bn++; }
    }
  }
  if (bn) for (const p of idx) { d[p * 3] = br / bn; d[p * 3 + 1] = bg / bn; d[p * 3 + 2] = bb / bn; }
  const iters = iterations || Math.min(400, 40 + Math.round(Math.sqrt(idx.length) * 2));
  for (let it = 0; it < iters; it++) {
    for (const p of idx) {
      const x = p % w, y = (p / w) | 0;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = (yy * w + xx) * 3;
        r += d[q]; g += d[q + 1]; b += d[q + 2]; n++;
      }
      d[p * 3] = r / n; d[p * 3 + 1] = g / n; d[p * 3 + 2] = b / n;
    }
  }
  const out = new Uint8ClampedArray(src.data);
  for (const p of idx) { out[p * 4] = d[p * 3]; out[p * 4 + 1] = d[p * 3 + 1]; out[p * 4 + 2] = d[p * 3 + 2]; }
  return { width: w, height: h, data: out };
}
