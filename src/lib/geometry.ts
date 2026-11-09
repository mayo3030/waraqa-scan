// Pure geometry helpers: point ordering, homography and perspective warp.
// No DOM use, so these run in Node tests too.

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

/** Orders any 4 points as TL, TR, BR, BL. */
export function orderQuad(pts: Pt[]): Quad {
  if (pts.length !== 4) throw new Error("need 4 points");
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  // sorted is clockwise in screen coords starting near the left (angle -PI).
  // Pick top-left as the one with the smallest x + y.
  let tl = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[tl].x + sorted[tl].y) tl = i;
  }
  const out = [0, 1, 2, 3].map((k) => sorted[(tl + k) % 4]);
  return out as Quad;
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function quadArea(q: Quad) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** True when the quad is convex and not self-intersecting. */
export function isConvex(q: Quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

export function fullQuad(w: number, h: number, inset = 0): Quad {
  const ix = w * inset, iy = h * inset;
  return [
    { x: ix, y: iy },
    { x: w - ix, y: iy },
    { x: w - ix, y: h - iy },
    { x: ix, y: h - iy },
  ];
}

/** Output size of the flattened page, keeping its real proportions. */
export function outputSize(q: Quad, maxSide = 2000) {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * s));
  h = Math.max(1, Math.round(h * s));
  return { w, h };
}

/** Solves A x = b (n x n) with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error("singular");
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homography H (3x3, row-major, h33 = 1) mapping each from[i] to to[i]. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

export function applyH(H: number[], x: number, y: number): Pt {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
}

/** Flattens the quad in src into a w x h raster (bilinear sampling). */
export function warpPerspective(src: Raster, q: Quad, w: number, h: number): Raster {
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: w - 1, y: 0 },
    { x: w - 1, y: h - 1 },
    { x: 0, y: h - 1 },
  ];
  const H = homography(rect, q); // destination pixel -> source pixel
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < h; y++) {
    // incremental evaluation along the row
    let nx = H[1] * y + H[2], ny = H[4] * y + H[5], dd = H[7] * y + H[8];
    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4, nx += H[0], ny += H[3], dd += H[6]) {
      let sx = nx / dd, sy = ny / dd;
      if (sx < 0) sx = 0; else if (sx > sw - 1) sx = sw - 1;
      if (sy < 0) sy = 0; else if (sy > sh - 1) sy = sh - 1;
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** Rotates a raster by 90 degree steps clockwise. */
export function rotate90(src: Raster, turns: number): Raster {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return src;
  const { width: w, height: h, data } = src;
  const nw = t % 2 ? h : w, nh = t % 2 ? w : h;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number, ny: number;
      if (t === 1) { nx = h - 1 - y; ny = x; }
      else if (t === 2) { nx = w - 1 - x; ny = h - 1 - y; }
      else { nx = y; ny = w - 1 - x; }
      const si = (y * w + x) * 4, di = (ny * nw + nx) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { width: nw, height: nh, data: out };
}
