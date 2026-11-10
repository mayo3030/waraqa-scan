// Flash glare on shiny cards (IDs, licences, bank cards, photos).
// One photo cannot get back what the shine burned to white, so the fix is two photos of the
// same card from slightly different angles: the shine moves, the card does not. Both photos
// are flattened to the same size, laid over each other, and every spot is taken from the
// photo where it is not washed out. Where both are clean, the sharper photo is used.
import { boxBlur } from "./filters";
import type { Raster } from "./geometry";

function percentile(f: Float32Array, p: number): number {
  const s = Float32Array.from(f).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)))];
}

interface Small { w: number; h: number; L: Float32Array; S: Float32Array; scale: number }

/** A small copy (long side about `side`): brightness and colourfulness, each pixel the mean of its block. */
function small(src: Raster, side: number): Small {
  const { width: W, height: H, data } = src;
  const scale = Math.min(1, side / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  const L = new Float32Array(w * h), S = new Float32Array(w * h);
  const bx = W / w, by = H / h;
  const step = Math.max(1, Math.floor(Math.min(bx, by) / 3));
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * by), y1 = Math.max(y0 + 1, Math.floor((y + 1) * by));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * bx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * bx));
      let l = 0, s = 0, n = 0;
      for (let yy = y0; yy < y1; yy += step) for (let xx = x0; xx < x1; xx += step) {
        const k = (yy * W + xx) * 4;
        const r = data[k], g = data[k + 1], b = data[k + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        l += 0.299 * r + 0.587 * g + 0.114 * b;
        s += mx ? (mx - mn) / mx : 0;
        n++;
      }
      L[y * w + x] = l / n; S[y * w + x] = s / n;
    }
  }
  return { w, h, L, S, scale };
}

export interface Glare {
  /** Share of the card covered by glare patches (0 to 1). */
  fraction: number;
  /** True when there is enough glare to be worth fixing. */
  found: boolean;
}

/**
 * Finds flash glare on a flattened card: patches burned to near white with no colour, on a
 * card that is otherwise darker. A white sheet of paper is not glare.
 */
export function findGlare(src: Raster): Glare {
  const s = small(src, 320);
  const n = s.w * s.h;
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) mask[i] = s.L[i] >= 244 && s.S[i] < 0.09 ? 1 : 0;
  const r = Math.max(1, Math.round(Math.max(s.w, s.h) * 0.012));
  const blur = boxBlur(mask, s.w, s.h, r);
  let count = 0;
  for (let i = 0; i < n; i++) if (blur[i] > 0.55) count++;
  const fraction = count / n;
  const level = percentile(s.L, 0.5);
  return { fraction, found: fraction > 0.003 && level < 224 };
}

/** Edge strength of a small copy, for lining photos up. */
function edges(L: Float32Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    g[i] = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]);
  }
  return g;
}

/** Whole-pixel shift of b over a with the least edge difference, within r of (cx, cy). */
function bestShift(a: Float32Array, b: Float32Array, w: number, h: number, cx: number, cy: number, r: number, stride: number): [number, number] {
  const m = r + Math.abs(cx) + Math.abs(cy) + 2;
  let best = Infinity, bx = cx, by = cy;
  for (let dy = cy - r; dy <= cy + r; dy++) for (let dx = cx - r; dx <= cx + r; dx++) {
    let cost = 0, n = 0;
    for (let y = m; y < h - m; y += stride) {
      const row = y * w, rowb = (y + dy) * w + dx;
      for (let x = m; x < w - m; x += stride) { cost += Math.abs(a[row + x] - b[rowb + x]); n++; }
    }
    cost /= Math.max(1, n);
    if (cost < best) { best = cost; bx = dx; by = dy; }
  }
  return [bx, by];
}

/**
 * The shift (dx, dy) in whole pixels so that b(x + dx, y + dy) lies over a(x, y).
 * Both photos have the same size. Searches up to `maxFrac` of the long side.
 */
export function findShift(a: Raster, b: Raster, maxFrac = 0.04): [number, number] {
  const f = shiftField(a, b, maxFrac);
  const mid = (v: Float32Array) => Float32Array.from(v).sort()[v.length >> 1];
  return [Math.round(mid(f.dx)), Math.round(mid(f.dy))];
}

/** Shifts measured on a grid of tiles: corners found a few pixels off bend the card a little. */
interface Field { gx: number; gy: number; dx: Float32Array; dy: Float32Array }

function shiftField(a: Raster, b: Raster, maxFrac = 0.04): Field {
  const sa = small(a, 360), sb = small(b, 360);
  const ga = edges(sa.L, sa.w, sa.h), gb = edges(sb.L, sb.w, sb.h);
  const R = Math.max(2, Math.ceil(Math.max(sa.w, sa.h) * maxFrac));
  const [cx, cy] = bestShift(ga, gb, sa.w, sa.h, 0, 0, R, 2);
  const k = Math.min(1, 1100 / Math.max(a.width, a.height));
  const fa = small(a, Math.round(Math.max(a.width, a.height) * k)), fb = small(b, Math.round(Math.max(b.width, b.height) * k));
  const ea = edges(fa.L, fa.w, fa.h), eb = edges(fb.L, fb.w, fb.h);
  const f = fa.scale / sa.scale;
  const gx = fa.w >= fa.h ? 4 : 3, gy = fa.w >= fa.h ? 3 : 4;
  const local = Math.max(3, Math.ceil(Math.max(sa.w, sa.h) * 0.015)); // a corner found a little off
  const xs: number[] = [], ys: number[] = [], sx: number[] = [], sy: number[] = [], energy: number[] = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    // Coarse: this tile's own shift near the whole-card one, on the small copy.
    const tile = (w: number, h: number, mg: number) => ({
      x0: Math.max(mg, Math.floor((i * w) / gx)), x1: Math.min(w - mg, Math.floor(((i + 1) * w) / gx)),
      y0: Math.max(mg, Math.floor((j * h) / gy)), y1: Math.min(h - mg, Math.floor(((j + 1) * h) / gy)),
    });
    const c = tile(sa.w, sa.h, local + Math.abs(cx) + Math.abs(cy) + 2);
    const [tx, ty] = searchTile(ga, gb, sa.w, c, cx, cy, local, 1).best;
    // Fine: around that, on the bigger copy, to a fraction of a pixel.
    const r = Math.ceil(f) + 1;
    const fx0 = Math.round(tx * f), fy0 = Math.round(ty * f);
    const t = tile(fa.w, fa.h, r + Math.abs(fx0) + Math.abs(fy0) + 2);
    const res = searchTile(ea, eb, fa.w, t, fx0, fy0, r, 2);
    let e = 0;
    for (let y = t.y0; y < t.y1; y += 2) for (let x = t.x0; x < t.x1; x += 2) e += ea[y * fa.w + x];
    energy.push(e / Math.max(1, ((t.x1 - t.x0) * (t.y1 - t.y0)) / 4));
    xs.push(((t.x0 + t.x1) / 2) / fa.w); ys.push(((t.y0 + t.y1) / 2) / fa.h);
    sx.push(res.sub[0]); sy.push(res.sub[1]);
  }
  // A card bent by corners found a little off moves smoothly: fit a plane to the tiles with
  // enough detail, and use it for tiles that are blank or far from it.
  const meanE = energy.reduce((p, v) => p + v, 0) / energy.length;
  const ok = energy.map((e) => e > meanE * 0.3);
  const fit = (v: number[]) => planeFit(xs, ys, v, ok);
  let px = fit(sx), py = fit(sy);
  for (let t = 0; t < sx.length; t++) if (Math.hypot(sx[t] - px(xs[t], ys[t]), sy[t] - py(xs[t], ys[t])) > 2) ok[t] = false;
  px = fit(sx); py = fit(sy);
  const dx = new Float32Array(sx.length), dy = new Float32Array(sy.length);
  for (let t = 0; t < sx.length; t++) {
    const good = ok[t] && Math.hypot(sx[t] - px(xs[t], ys[t]), sy[t] - py(xs[t], ys[t])) <= 1.5;
    dx[t] = (good ? sx[t] : px(xs[t], ys[t])) / fa.scale;
    dy[t] = (good ? sy[t] : py(xs[t], ys[t])) / fa.scale;
  }
  return { gx, gy, dx, dy };
}

/** Best whole-pixel shift for one tile, and the same refined to a fraction of a pixel. */
function searchTile(a: Float32Array, b: Float32Array, w: number, t: { x0: number; x1: number; y0: number; y1: number }, cx: number, cy: number, r: number, stride: number) {
  const size = 2 * r + 1;
  const costs = new Float64Array(size * size);
  let best = Infinity, bi = 0, bj = 0;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = cx - r + i, dy = cy - r + j;
    let cost = 0;
    for (let y = t.y0; y < t.y1; y += stride) {
      const row = y * w, rowb = (y + dy) * w + dx;
      for (let x = t.x0; x < t.x1; x += stride) cost += Math.abs(a[row + x] - b[rowb + x]);
    }
    costs[j * size + i] = cost;
    if (cost < best) { best = cost; bi = i; bj = j; }
  }
  const para = (l: number, c: number, rr: number) => { const d = l - 2 * c + rr; return d > 0 ? Math.max(-0.5, Math.min(0.5, (l - rr) / (2 * d))) : 0; };
  const ox = bi > 0 && bi < size - 1 ? para(costs[bj * size + bi - 1], best, costs[bj * size + bi + 1]) : 0;
  const oy = bj > 0 && bj < size - 1 ? para(costs[(bj - 1) * size + bi], best, costs[(bj + 1) * size + bi]) : 0;
  const bx = cx - r + bi, by = cy - r + bj;
  return { best: [bx, by] as [number, number], sub: [bx + ox, by + oy] as [number, number] };
}

/** Least-squares v = a + b x + c y over the tiles marked ok (the middle value if too few). */
function planeFit(xs: number[], ys: number[], v: number[], ok: boolean[]): (x: number, y: number) => number {
  const idx = v.map((_, i) => i).filter((i) => ok[i]);
  if (idx.length < 3) {
    const all = (idx.length ? idx.map((i) => v[i]) : v.slice()).sort((p, q) => p - q);
    const mid = all[all.length >> 1];
    return () => mid;
  }
  // Normal equations, 3 x 3.
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, sv = 0, sxv = 0, syv = 0;
  for (const i of idx) {
    const x = xs[i], y = ys[i], z = v[i];
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; sv += z; sxv += x * z; syv += y * z;
  }
  const M = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], B = [sv, sxv, syv];
  const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M);
  if (Math.abs(D) < 1e-9) { const mid = idx.map((i) => v[i]).sort((p, q) => p - q)[idx.length >> 1]; return () => mid; }
  const col = (k: number) => M.map((row, r) => row.map((x, c) => (c === k ? B[r] : x)));
  const a = det3(col(0)) / D, b = det3(col(1)) / D, c = det3(col(2)) / D;
  return (x, y) => a + b * x + c * y;
}

/** `src` moved onto `ref` by the shift field, as float channels (bilinear). */
function warpBy(src: Raster, f: Field): Float32Array[] {
  const { width: W, height: H, data } = src;
  const n = W * H;
  const out = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const tw = W / f.gx, th = H / f.gy;
  for (let y = 0; y < H; y++) {
    const ty = Math.min(f.gy - 1, Math.max(0, y / th - 0.5));
    const j0 = Math.floor(ty), j1 = Math.min(f.gy - 1, j0 + 1), ay = ty - j0;
    for (let x = 0; x < W; x++) {
      const tx = Math.min(f.gx - 1, Math.max(0, x / tw - 0.5));
      const i0 = Math.floor(tx), i1 = Math.min(f.gx - 1, i0 + 1), ax = tx - i0;
      const a00 = j0 * f.gx + i0, a01 = j0 * f.gx + i1, a10 = j1 * f.gx + i0, a11 = j1 * f.gx + i1;
      const ddx = (f.dx[a00] * (1 - ax) + f.dx[a01] * ax) * (1 - ay) + (f.dx[a10] * (1 - ax) + f.dx[a11] * ax) * ay;
      const ddy = (f.dy[a00] * (1 - ax) + f.dy[a01] * ax) * (1 - ay) + (f.dy[a10] * (1 - ax) + f.dy[a11] * ax) * ay;
      const px = Math.min(W - 1.001, Math.max(0, x + ddx)), py = Math.min(H - 1.001, Math.max(0, y + ddy));
      const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0;
      const k00 = (y0 * W + x0) * 4, k01 = k00 + 4, k10 = k00 + W * 4, k11 = k10 + 4;
      const i = y * W + x;
      for (let c = 0; c < 3; c++) {
        out[c][i] = (data[k00 + c] * (1 - fx) + data[k01 + c] * fx) * (1 - fy) + (data[k10 + c] * (1 - fx) + data[k11 + c] * fx) * fy;
      }
    }
  }
  return out;
}

function sharpness(r: Raster): number {
  const s = small(r, 500);
  const g = edges(s.L, s.w, s.h);
  let e = 0;
  for (let i = 0; i < g.length; i++) e += g[i] * g[i];
  return e / g.length;
}

/**
 * Joins photos of the same flattened card (same size) into one without the glare.
 * Each spot comes from the photo where it is darkest and most even; elsewhere the sharpest
 * photo is kept as it is, so text stays crisp.
 */
export function mergeGlare(shots: Raster[]): Raster {
  if (shots.length < 2) return shots[0];
  const { width: W, height: H } = shots[0];
  const usable = shots.filter((s) => s.width === W && s.height === H);
  if (usable.length < 2) return shots[0];
  const n = W * H;

  const sharp = usable.map(sharpness);
  const refIdx = sharp.indexOf(Math.max(...sharp));
  const ref = usable[refIdx];
  const order = [ref, ...usable.filter((_, i) => i !== refIdx)];

  // Each photo as float channels, lined up with the sharpest and matched to its exposure.
  const chans: Float32Array[][] = [];
  for (let s = 0; s < order.length; s++) {
    if (s === 0) {
      const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
      for (let i = 0, k = 0; i < n; i++, k += 4) { ch[0][i] = ref.data[k]; ch[1][i] = ref.data[k + 1]; ch[2][i] = ref.data[k + 2]; }
      chans.push(ch);
    } else chans.push(warpBy(order[s], shiftField(ref, order[s])));
  }
  const lum = (ch: Float32Array[], i: number) => 0.299 * ch[0][i] + 0.587 * ch[1][i] + 0.114 * ch[2][i];
  for (let s = 1; s < chans.length; s++) {
    // Exposure: compare the two where neither is dark, burned out, or very different.
    const sum = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i += 3) {
      const la = lum(chans[0], i), lb = lum(chans[s], i);
      if (la < 30 || lb < 30 || la > 235 || lb > 235 || Math.abs(la - lb) > 40) continue;
      for (let c = 0; c < 3; c++) { sum[c] += chans[0][c][i]; sum[c + 3] += chans[s][c][i]; }
    }
    for (let c = 0; c < 3; c++) {
      const gain = sum[c + 3] > 0 ? Math.min(1.4, Math.max(0.7, sum[c] / sum[c + 3])) : 1;
      if (Math.abs(gain - 1) > 0.005) { const a = chans[s][c]; for (let i = 0; i < n; i++) a[i] *= gain; }
    }
  }

  // Smoothed brightness of each photo: glare is a soft bright patch, text is not.
  const r = Math.max(2, Math.round(Math.max(W, H) * 0.01));
  const blurred: Float32Array[] = [];
  for (const ch of chans) {
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = lum(ch, i);
    blurred.push(boxBlur(boxBlur(L, W, H, r), W, H, r));
  }

  // How washed out each photo is at each spot, compared with the darkest photo there. The
  // measure is spread outwards a little so the soft edge of a shine goes with its middle.
  const m = chans.length;
  const r2 = Math.max(3, Math.round(Math.max(W, H) * 0.025));
  const pens: Float32Array[] = [];
  for (let s = 0; s < m; s++) {
    const pen = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let lmin = Infinity;
      for (let t = 0; t < m; t++) lmin = Math.min(lmin, blurred[t][i]);
      // Glare only ever adds light, also over dark parts like the face photo.
      pen[i] = Math.max(0, blurred[s][i] - lmin - 2);
    }
    const wide = boxBlur(boxBlur(pen, W, H, r2), W, H, r2);
    for (let i = 0; i < n; i++) pen[i] = Math.max(pen[i], 2.5 * wide[i]);
    pens.push(pen);
  }

  const out = new Uint8ClampedArray(n * 4);
  const wts = new Float32Array(m);
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (let s = 0; s < m; s++) {
      let wgt = (s === 0 ? 1 : 0.08) * Math.exp(-pens[s][i] / 3);
      const ch = chans[s];
      if (ch[0][i] >= 252 || ch[1][i] >= 252 || ch[2][i] >= 252) wgt *= 0.02;
      wts[s] = wgt; total += wgt;
    }
    const k = i * 4;
    for (let c = 0; c < 3; c++) {
      let v = 0;
      for (let s = 0; s < m; s++) v += wts[s] * chans[s][c][i];
      out[k + c] = v / total;
    }
    out[k + 3] = 255;
  }
  return { width: W, height: H, data: out };
}
