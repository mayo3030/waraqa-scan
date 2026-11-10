// Page filters on raw RGBA rasters. Pure functions, no DOM.
//
// The building blocks:
// - background(): how bright the paper is around each pixel, per colour channel. Dividing by it
//   removes shadows, uneven light and the colour cast of the lamp in one step.
// - sharpen(): unsharp mask on brightness only, so edges get crisper without colour fringes.
// - levels and white balance from the image's own histogram.
// Every filter keeps the raster's size; alpha is always 255.
import type { Raster } from "./geometry";

export type FilterKind = "auto" | "enhance" | "photo" | "original" | "lighten" | "noshadow" | "gray" | "bw";

export const FILTERS: { id: FilterKind; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Picks Magic Color for papers and Photo for cards and pictures" },
  { id: "original", label: "Original", hint: "As photographed" },
  { id: "enhance", label: "Magic Color", hint: "White paper, no shadows, dark ink, vivid stamps and signatures" },
  { id: "photo", label: "Photo", hint: "True colors for cards, IDs and pictures: balanced, sharper, clearer" },
  { id: "lighten", label: "Lighten", hint: "Brighter, for pages taken in poor light" },
  { id: "noshadow", label: "No Shadow", hint: "Even light with the page's own colors" },
  { id: "gray", label: "Gray", hint: "Clean gray tones" },
  { id: "bw", label: "B&W", hint: "Pure black text on white" },
];

export interface Adjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0 };

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function copyRaster(src: Raster): Raster {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

/** Box blur, separable, edges clamped. Two passes look close to a Gaussian. */
export function boxBlur(f: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return f.slice();
  const tmp = new Float32Array(f.length), out = new Float32Array(f.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += f[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += f[row + Math.min(w - 1, x + r + 1)] - f[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function lumPlane(src: Raster): Float32Array {
  const d = src.data, L = new Float32Array(src.width * src.height);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = lum(d[i], d[i + 1], d[i + 2]);
  return L;
}

/**
 * Unsharp mask on brightness: the same lift is added to R, G and B, so colours do not fringe.
 * Differences smaller than `threshold` are left alone, which keeps paper grain and noise flat.
 */
export function sharpen(src: Raster, radius: number, amount: number, threshold = 2): Raster {
  const { width: w, height: h } = src;
  const L = lumPlane(src);
  const blur = boxBlur(boxBlur(L, w, h, radius), w, h, radius);
  const d = src.data;
  for (let j = 0, i = 0; j < L.length; j++, i += 4) {
    let detail = L[j] - blur[j];
    const a = Math.abs(detail);
    if (a < threshold) continue;
    // soften the start so the threshold leaves no visible step
    if (a < threshold * 2) detail *= (a - threshold) / threshold;
    const add = detail * amount;
    d[i] = clamp(d[i] + add); d[i + 1] = clamp(d[i + 1] + add); d[i + 2] = clamp(d[i + 2] + add);
  }
  return src;
}

/** Radius for fine sharpening, in pixels, for this page size. */
const fineRadius = (r: Raster) => Math.max(1, Math.round(Math.max(r.width, r.height) / 1100));

interface Background { at(x: number, y: number, out: Float32Array): void; level: number }

/**
 * How bright the paper is around each pixel, per channel. The page is cut into cells; each cell
 * gives its 92nd-percentile value (the paper between the ink). Cells with no paper in them (a
 * photo, a dark block) are filled from their neighbours, then the grid is smoothed.
 */
function background(src: Raster): Background {
  const { width: w, height: h, data } = src;
  const cell = Math.max(8, Math.round(Math.max(w, h) / 32));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const n = gw * gh;
  const grid = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const lumG = new Float32Array(n);
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const step = cell >= 24 ? 3 : 2;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    for (const hh of hist) hh.fill(0);
    let cnt = 0;
    const ys = gy * cell, xs = gx * cell, ye = Math.min(h, ys + cell), xe = Math.min(w, xs + cell);
    for (let y = ys; y < ye; y += step) for (let x = xs; x < xe; x += step) {
      const i = (y * w + x) * 4;
      hist[0][data[i]]++; hist[1][data[i + 1]]++; hist[2][data[i + 2]]++;
      hist[3][lum(data[i], data[i + 1], data[i + 2]) | 0]++;
      cnt++;
    }
    const target = cnt * 0.92;
    const pct = (hh: Uint32Array) => { let acc = 0; for (let k = 0; k < 256; k++) { acc += hh[k]; if (acc >= target) return k; } return 255; };
    const g = gy * gw + gx;
    grid[0][g] = pct(hist[0]); grid[1][g] = pct(hist[1]); grid[2][g] = pct(hist[2]); lumG[g] = pct(hist[3]);
  }
  // The paper level: a high percentile of the cells, so a page mostly covered in print still has one.
  const sorted = Float32Array.from(lumG).sort();
  const level = Math.max(60, sorted[Math.min(n - 1, Math.floor(n * 0.85))]);
  // Cells much darker than the paper have no paper in them: fill them from valid neighbours.
  const valid = new Uint8Array(n);
  for (let g = 0; g < n; g++) valid[g] = lumG[g] >= level * 0.62 ? 1 : 0;
  if (!valid.some((v) => v)) valid.fill(1);
  for (let pass = 0; pass < gw + gh; pass++) {
    let changed = false;
    const next = valid.slice();
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const g = gy * gw + gx;
      if (valid[g]) continue;
      let s0 = 0, s1 = 0, s2 = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = gy + dy, xx = gx + dx;
        if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
        const k = yy * gw + xx;
        if (!valid[k]) continue;
        s0 += grid[0][k]; s1 += grid[1][k]; s2 += grid[2][k]; c++;
      }
      if (c) { grid[0][g] = s0 / c; grid[1][g] = s1 / c; grid[2][g] = s2 / c; next[g] = 1; changed = true; }
    }
    valid.set(next);
    if (!changed) break;
  }
  // Smooth: a 3x3 max keeps ink strokes from denting the paper, then two 3x3 means.
  const smooth = (a: Float32Array, op: "max" | "mean") => {
    const o = new Float32Array(n);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let s = op === "max" ? 0 : 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = gy + dy, xx = gx + dx;
        if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
        const v = a[yy * gw + xx];
        if (op === "max") s = Math.max(s, v); else { s += v; c++; }
      }
      o[gy * gw + gx] = op === "max" ? Math.max(a[gy * gw + gx], s * 0.97) : s / c;
    }
    return o;
  };
  for (let c = 0; c < 3; c++) {
    grid[c] = smooth(smooth(smooth(grid[c], "max"), "mean"), "mean");
    for (let g = 0; g < n; g++) grid[c][g] = Math.max(grid[c][g], 24);
  }
  return {
    level,
    at(x, y, out) {
      const fx = Math.min(gw - 1.001, Math.max(0, x / cell - 0.5));
      const fy = Math.min(gh - 1.001, Math.max(0, y / cell - 0.5));
      const x0 = fx | 0, y0 = fy | 0;
      const x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
      const ax = fx - x0, ay = fy - y0;
      for (let c = 0; c < 3; c++) {
        const G = grid[c];
        const a = G[y0 * gw + x0] + (G[y0 * gw + x1] - G[y0 * gw + x0]) * ax;
        const b = G[y1 * gw + x0] + (G[y1 * gw + x1] - G[y1 * gw + x0]) * ax;
        out[c] = a + (b - a) * ay;
      }
    },
  };
}

/** Each pixel divided by the paper around it: 1 is paper, lower is ink. Per channel. */
function normalize(src: Raster, bg: Background): Float32Array {
  const { width: w, height: h, data } = src;
  const out = new Float32Array(w * h * 3);
  const b = new Float32Array(3);
  for (let y = 0; y < h; y++) {
    // the background changes slowly: sample it every 4 pixels along the row
    for (let x = 0; x < w; x++) {
      if ((x & 3) === 0) bg.at(x + 1.5, y, b);
      const i = (y * w + x) * 4, o = (y * w + x) * 3;
      out[o] = data[i] / b[0]; out[o + 1] = data[i + 1] / b[1]; out[o + 2] = data[i + 2] / b[2];
    }
  }
  return out;
}

/** Brightness percentiles (0..255) of a raster, sampled. */
function percentiles(src: Raster, ps: number[]): number[] {
  const d = src.data, hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(d.length / 4 / 250000)) * 4;
  let n = 0;
  for (let i = 0; i < d.length; i += step) { hist[lum(d[i], d[i + 1], d[i + 2]) | 0]++; n++; }
  return ps.map((p) => { let acc = 0; const t = n * p; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= t) return k; } return 255; });
}

/**
 * Levels with a gamma, on brightness only: each pixel moves by the change of its brightness,
 * so its colour (hue and strength) stays as it was. Doing it per channel instead pushes dark
 * colours into strong, wrong ones.
 */
function levels(src: Raster, lo: number, hi: number, gamma = 1): Raster {
  const lut = new Float32Array(256);
  const span = Math.max(1, hi - lo);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / span)), gamma) - v;
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const add = lut[lum(r, g, b) | 0];
    // keep the colour inside 0..255: shrink the change rather than clip one channel
    const top = Math.max(r, g, b), bot = Math.min(r, g, b);
    const k = add > 0 ? Math.min(add, 255 - top) / add || 0 : add < 0 ? Math.min(-add, bot) / -add || 0 : 1;
    const a = add * (k < 1 ? 0.5 + 0.5 * k : 1);
    d[i] = r + a; d[i + 1] = g + a; d[i + 2] = b + a;
  }
  return src;
}

/** Auto levels: darkest 0.5% to black and brightest 0.5% to white, with limits so it never overdoes it. */
function autoLevels(src: Raster, gamma = 1): Raster {
  const [lo, hi] = percentiles(src, [0.005, 0.995]);
  const black = Math.min(lo, 55);
  const white = Math.max(hi, black + 255 / 2.2, 150);
  return levels(src, black, Math.min(255, white), gamma);
}

/** Neutral white: gains from the bright, low-colour pixels (the paper or the card's white). */
function whiteBalance(src: Raster, strength: number): Raster {
  const d = src.data;
  const [p95] = percentiles(src, [0.95]);
  let r = 0, g = 0, b = 0, n = 0, total = 0;
  for (let i = 0; i < d.length; i += 8) {
    total++;
    const L = lum(d[i], d[i + 1], d[i + 2]);
    if (L < p95 * 0.9) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx - mn > 40) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (n < total * 0.02) return src; // no white or gray in the picture: leave its colours alone
  r /= n; g /= n; b /= n;
  const m = (r + g + b) / 3;
  const gain = [r, g, b].map((c) => 1 + (Math.min(1.35, Math.max(0.8, m / c)) - 1) * strength);
  const luts = gain.map((k) => { const l = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) l[v] = v * k; return l; });
  for (let i = 0; i < d.length; i += 4) { d[i] = luts[0][d[i]]; d[i + 1] = luts[1][d[i + 1]]; d[i + 2] = luts[2][d[i + 2]]; }
  return src;
}

/** Saturation: s > 1 more colour. vibrance boosts muted colours more than strong ones. */
function saturate(src: Raster, s: number, vibrance = false): Raster {
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const L = lum(r, g, b);
    let k = s;
    if (vibrance) {
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      k = 1 + (s - 1) * (1 - sat);
    }
    d[i] = clamp(L + (r - L) * k); d[i + 1] = clamp(L + (g - L) * k); d[i + 2] = clamp(L + (b - L) * k);
  }
  return src;
}

/** Local contrast ("clarity"): a wide, gentle unsharp mask. */
function clarity(src: Raster, amount: number): Raster {
  return sharpen(src, Math.max(4, Math.round(Math.max(src.width, src.height) / 60)), amount, 0);
}

// ---------- The filters ----------

/** Magic Color: white paper, no shadows or colour cast, dark crisp ink, vivid colour ink. */
function magic(src: Raster): Raster {
  const { width: w, height: h } = src;
  const norm = normalize(src, background(src));
  // Black point from the darkest ink, so faint print still reaches near black.
  const hist = new Uint32Array(256);
  for (let o = 0; o < norm.length; o += 9) hist[Math.min(255, (lum(norm[o], norm[o + 1], norm[o + 2]) * 255) | 0)]++;
  let acc = 0, black = 0;
  const total = norm.length / 9;
  for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= total * 0.01) { black = k / 255; break; } }
  black = Math.min(0.4, black);
  const white = 0.9; // paper a little darker than its surroundings still turns white
  const lut = new Uint8ClampedArray(1024);
  for (let k = 0; k < 1024; k++) {
    const v = k / 1023 * 1.2;
    const t = Math.min(1, Math.max(0, (v - black) / (white - black)));
    lut[k] = 255 * Math.pow(t, 1.25);
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0, o = 0, i = 0; j < w * h; j++, o += 3, i += 4) {
    out[i] = lut[Math.min(1023, (norm[o] / 1.2 * 1023) | 0)];
    out[i + 1] = lut[Math.min(1023, (norm[o + 1] / 1.2 * 1023) | 0)];
    out[i + 2] = lut[Math.min(1023, (norm[o + 2] / 1.2 * 1023) | 0)];
    out[i + 3] = 255;
  }
  const r: Raster = { width: w, height: h, data: out };
  saturate(r, 1.35);
  return sharpen(r, fineRadius(r), 0.85, 3);
}

/** Photo: true colours for cards, IDs and pictures. Balanced white, full range, clearer, sharper. */
function photo(src: Raster): Raster {
  const r = copyRaster(src);
  whiteBalance(r, 0.7);
  autoLevels(r, 0.95);
  clarity(r, 0.3);
  saturate(r, 1.25, true);
  return sharpen(r, fineRadius(r), 0.7, 2);
}

/** No Shadow: even light, the page's own colours kept. */
function noShadow(src: Raster): Raster {
  const { width: w, height: h, data } = src;
  const bg = background(src);
  const out = new Uint8ClampedArray(data.length);
  const b = new Float32Array(3);
  const target = Math.min(250, bg.level * 1.04);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x & 3) === 0) bg.at(x + 1.5, y, b);
    const i = (y * w + x) * 4;
    const k = Math.min(2.5, target / lum(b[0], b[1], b[2]));
    out[i] = clamp(data[i] * k); out[i + 1] = clamp(data[i + 1] * k); out[i + 2] = clamp(data[i + 2] * k); out[i + 3] = 255;
  }
  const r: Raster = { width: w, height: h, data: out };
  autoLevels(r);
  return sharpen(r, fineRadius(r), 0.6, 2);
}

function lighten(src: Raster): Raster {
  const r = copyRaster(src);
  whiteBalance(r, 0.6);
  autoLevels(r, 0.72);
  saturate(r, 1.1, true);
  return sharpen(r, fineRadius(r), 0.55, 2);
}

function gray(src: Raster): Raster {
  const r = noShadow(src);
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d[i], d[i + 1], d[i + 2]);
  return autoLevels(r, 1.1);
}

/** Adaptive threshold on the shadow-free brightness: black ink, white paper. */
function bw(src: Raster): Raster {
  const { width: w, height: h } = src;
  const norm = normalize(src, background(src));
  const L = new Float32Array(w * h);
  for (let j = 0, o = 0; j < L.length; j++, o += 3) L[j] = Math.min(1.1, lum(norm[o], norm[o + 1], norm[o + 2]));
  const r = Math.max(7, Math.round(Math.max(w, h) / 50));
  const mean = boxBlur(L, w, h, r);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0, i = 0; j < L.length; j++, i += 4) {
    const ink = L[j] < mean[j] * 0.88 && L[j] < 0.8;
    out[i] = out[i + 1] = out[i + 2] = ink ? 0 : 255;
    out[i + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/**
 * What Auto does with this page: "enhance" for papers (mostly plain paper, little colour),
 * "photo" for cards, IDs and pictures (colourful, or full of mid tones).
 */
export function autoPick(src: Raster): "enhance" | "photo" {
  const s = Math.min(1, 240 / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const small = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (Math.min(src.height - 1, (y / s) | 0) * src.width + Math.min(src.width - 1, (x / s) | 0)) * 4, o = (y * w + x) * 4;
    small[o] = src.data[si]; small[o + 1] = src.data[si + 1]; small[o + 2] = src.data[si + 2]; small[o + 3] = 255;
  }
  const r: Raster = { width: w, height: h, data: small };
  const norm = normalize(r, background(r));
  let paper = 0, mid = 0, srg = 0, syb = 0, mrg = 0, myb = 0;
  const n = w * h;
  for (let j = 0, o = 0, i = 0; j < n; j++, o += 3, i += 4) {
    const v = lum(norm[o], norm[o + 1], norm[o + 2]);
    if (v > 0.85) paper++;
    else if (v > 0.25) mid++;
    const rg = small[i] - small[i + 1], yb = 0.5 * (small[i] + small[i + 1]) - small[i + 2];
    mrg += rg; myb += yb; srg += rg * rg; syb += yb * yb;
  }
  mrg /= n; myb /= n;
  // Colourfulness after Hasler and Suesstrunk, spread part only: a lamp's cast does not count.
  const spread = Math.sqrt(Math.max(0, srg / n - mrg * mrg) + Math.max(0, syb / n - myb * myb));
  return paper / n > 0.5 && mid / n < 0.3 && spread < 22 ? "enhance" : "photo";
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
  const k = kind === "auto" ? autoPick(src) : kind;
  let r: Raster;
  switch (k) {
    case "enhance": r = magic(src); break;
    case "photo": r = photo(src); break;
    case "lighten": r = lighten(src); break;
    case "noshadow": r = noShadow(src); break;
    case "gray": r = gray(src); break;
    case "bw": r = bw(src); break;
    default: r = src;
  }
  return adjust(r, a);
}
