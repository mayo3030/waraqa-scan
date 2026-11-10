// Finds the page outline in a photo with OpenCV.js.
// `cv` is the loaded OpenCV.js module (window.cv in the browser).
//
// Two steps. First, rough shapes: outlines in the edge picture and bright or dark regions,
// each turned into a four-corner guess. Second, every guess has each of its sides moved onto
// the longest straight edge near it. A finger over an edge bends the rough outline outwards,
// but a finger is not a long straight line, so the side lands back on the card.
// The guess whose sides are best backed by real edges, weighed by its size, wins.
import { fullQuad, isConvex, orderQuad, quadArea, type Pt, type Quad, type Raster } from "./geometry";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CV = any;

export interface Detection {
  quad: Quad;
  found: boolean; // false when we fell back to the whole image
}

interface Line { p: Pt; d: Pt } // a point on the line and its unit direction
interface Fit { line: Line; cover: number } // cover: share of the side that has edge pixels under it

const DEG = Math.PI / 180;

function intersect(a: Line, b: Line): Pt | null {
  const den = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den;
  return { x: a.p.x + a.d.x * t, y: a.p.y + a.d.y * t };
}

const CLEAR = 10; // how far outside a line is checked for other edges, in pixels

/**
 * Looks for the straight edge that best matches the side a-b: lines within `band` pixels and
 * `maxAng` degrees of it are tried. A line is rated by how much of its length has edge pixels
 * under it, less how much the strip just outside it has: the edge of a page has plain
 * background beyond it, while a line through text or a barcode has more of the same on both sides.
 * Among lines nearly as good as the best, the one closest to the side is kept, so a side already
 * on the page edge does not jump to a printed line inside the page or a table edge outside it.
 * `inside` is any point inside the shape, to tell which way is out.
 * `bandIn` lets the search reach further towards the inside than `band`, for a side that a
 * finger or a shadow has pushed far out; `near` is how close to the best a line must rate to
 * be kept when it is nearer to the side.
 */
function fitSide(ex: Int16Array, ey: Int16Array, a: Pt, b: Pt, inside: Pt, band: number, maxAng: number, step: number, bin: number, bandIn = band, near = 0.85): Fit {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nx = -uy, ny = ux;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const keep: Line = { p: { x: mx, y: my }, d: { x: ux, y: uy } };
  if (len < 24) return { line: keep, cover: 0 };
  const out = (inside.x - mx) * nx + (inside.y - my) * ny > 0 ? -1 : 1;
  // The ends are left out: corners are rounded, and the neighbouring sides cross there.
  const half = (len / 2) * 0.9;
  const R = Math.max(band, bandIn) + CLEAR;
  const reach = R + half * Math.sin(maxAng * DEG) + 1;
  const ts: number[] = [], os: number[] = [];
  for (let i = 0; i < ex.length; i++) {
    const dx = ex[i] - mx, dy = ey[i] - my;
    const o = dx * nx + dy * ny;
    if (o > reach || o < -reach) continue;
    const t = dx * ux + dy * uy;
    if (t > half || t < -half) continue;
    ts.push(t); os.push(o);
  }
  const nT = Math.max(1, Math.ceil((2 * half) / bin));
  if (ts.length < nT * 0.15) return { line: keep, cover: 0 };

  const nR = 2 * R + 1;
  const grid = new Uint8Array(nR * nT);
  const cov = new Float32Array(nR);
  const found: { phi: number; r: number; q: number }[] = [];
  let best = 0;
  for (let phi = -maxAng; phi <= maxAng + 1e-9; phi += step) {
    grid.fill(0);
    const c = Math.cos(phi * DEG), s = Math.sin(phi * DEG);
    for (let i = 0; i < ts.length; i++) {
      const r = Math.round(os[i] * c - ts[i] * s);
      if (r < -R || r > R) continue;
      const tb = Math.floor((ts[i] * c + os[i] * s + half) / bin);
      if (tb < 0 || tb >= nT) continue;
      grid[(r + R) * nT + tb] = 1;
    }
    for (let r = 0; r < nR; r++) {
      let n = 0;
      const r0 = Math.max(0, r - 1) * nT, r1 = r * nT, r2 = Math.min(nR - 1, r + 1) * nT;
      for (let t = 0; t < nT; t++) if (grid[r0 + t] | grid[r1 + t] | grid[r2 + t]) n++;
      cov[r] = n / nT;
    }
    for (let r = -Math.max(band, bandIn); r <= Math.max(band, bandIn); r++) {
      if (r * out > band || r * out < -bandIn) continue;
      let beyond = 0;
      for (let k = 3; k <= CLEAR; k++) beyond += cov[r + out * k + R];
      const q = cov[r + R] - beyond / (CLEAR - 2);
      if (q > 0.15) found.push({ phi, r, q });
      if (q > best) best = q;
    }
  }
  if (best < 0.2 || !found.length) return { line: keep, cover: Math.max(0, best) };
  let pick = found[0];
  for (const f of found) {
    if (f.q < best * near) continue;
    if (pick.q < best * near || Math.abs(f.r) < Math.abs(pick.r) || (Math.abs(f.r) === Math.abs(pick.r) && f.q > pick.q)) pick = f;
  }
  const c = Math.cos(pick.phi * DEG), s = Math.sin(pick.phi * DEG);
  // The picked line: turned by phi about the side's middle, then moved r along its own normal.
  const d = { x: ux * c + nx * s, y: uy * c + ny * s };
  const n = { x: -ux * s + nx * c, y: -uy * s + ny * c };
  return { line: { p: { x: mx + n.x * pick.r, y: my + n.y * pick.r }, d }, cover: pick.q };
}

interface Scored { quad: Quad; score: number; cover: number }

/** Moves each side of a rough guess onto the nearest long straight edge and rates the result. */
function refine(ex: Int16Array, ey: Int16Array, rough: Quad, W: number, H: number): Scored | null {
  const band = Math.max(10, Math.round(Math.max(W, H) * 0.06));
  let q = rough;
  let covers = [0, 0, 0, 0];
  // A wide look first, then a narrow one for exact placement.
  for (const [bnd, ang, step, bin] of [[band, 9, 1.5, 3], [4, 1.5, 0.25, 2]] as const) {
    const mid = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
    const fits = [0, 1, 2, 3].map((i) => {
      const a = q[i], b = q[(i + 1) % 4];
      const fit = fitSide(ex, ey, a, b, mid, bnd, ang, step, bin);
      if (bnd !== band || fit.cover >= 0.35) return fit;
      // Nothing straight near this side: something (a finger, usually) has pushed it out.
      // Look further in, up to almost half way across the shape.
      const depth = Math.abs((mid.x - a.x) * (b.y - a.y) - (mid.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
      const wide = fitSide(ex, ey, a, b, mid, bnd, ang, step, bin, Math.round(depth * 0.9), 0.6);
      return wide.cover > fit.cover + 0.1 ? wide : fit;
    });
    const pts = [0, 1, 2, 3].map((i) => intersect(fits[(i + 3) % 4].line, fits[i].line));
    if (pts.some((p) => !p)) return null;
    q = pts as Quad;
    covers = fits.map((f) => f.cover);
  }
  const m = Math.max(W, H) * 0.03;
  if (q.some((p) => p.x < -m || p.y < -m || p.x > W - 1 + m || p.y > H - 1 + m)) return null;
  q = q.map((p) => ({ x: Math.min(W - 1, Math.max(0, p.x)), y: Math.min(H - 1, Math.max(0, p.y)) })) as Quad;
  if (!isConvex(q)) return null;
  const area = quadArea(q) / (W * H);
  if (area < 0.05) return null;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l2 < Math.max(W, H) * 0.12) return null;
    const cos = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    if (Math.abs(cos) > 0.64) return null; // a corner sharper than about 50 degrees is not a page
  }
  const avg = (covers[0] + covers[1] + covers[2] + covers[3]) / 4;
  const min = Math.min(...covers);
  // A shape hugging the whole frame is usually the photo border.
  const touches = q.filter((p) => p.x < 2 || p.y < 2 || p.x > W - 3 || p.y > H - 3).length;
  const score = area * avg * (0.5 + 0.5 * min) * (touches >= 3 ? 0.4 : 1);
  return { quad: q, score, cover: avg };
}

/**
 * Returns the page corners in the raster's own coordinates.
 * Works on a downscaled copy (max 640px) for speed.
 */
export function detectPage(cv: CV, src: Raster): Detection {
  const maxSide = 640;
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const mats: any[] = [];
  const keep = <T>(m: T) => (mats.push(m), m);
  try {
    const full = keep(cv.matFromImageData({ width: src.width, height: src.height, data: src.data }));
    const small = keep(new cv.Mat());
    cv.resize(full, small, new cv.Size(Math.round(src.width * s), Math.round(src.height * s)), 0, 0, cv.INTER_AREA);
    const gray = keep(new cv.Mat());
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const W = small.cols, H = small.rows;
    const imgArea = W * H;
    const k5 = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));

    // Colour edges as well as brightness edges: a card in a hand can match the skin in
    // brightness and still differ from it in colour.
    const colour = keep(new cv.Mat());
    {
      const rgb = keep(new cv.Mat());
      cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB);
      const lab = keep(new cv.Mat());
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
      const ch = keep(new cv.MatVector());
      cv.split(lab, ch);
      cv.Mat.zeros(H, W, cv.CV_8UC1).copyTo(colour);
      for (const i of [1, 2]) {
        const c = ch.get(i), e = new cv.Mat();
        cv.GaussianBlur(c, c, new cv.Size(7, 7), 0);
        cv.Canny(c, e, 14, 42);
        cv.bitwise_or(colour, e, colour);
        c.delete(); e.delete();
      }
    }

    const rough: Quad[] = [];
    const seen = new Set<string>();
    const add = (pts: Pt[]) => {
      const q = orderQuad(pts);
      if (!isConvex(q) || quadArea(q) < imgArea * 0.06) return;
      const key = q.map((p) => `${Math.round(p.x / 6)},${Math.round(p.y / 6)}`).join(";");
      if (!seen.has(key)) { seen.add(key); rough.push(q); }
    };
    // Four-corner guesses from every large outline in a black-and-white picture.
    const guesses = (bw: any, mode: number) => {
      const contours = keep(new cv.MatVector());
      const hier = keep(new cv.Mat());
      cv.findContours(bw, contours, hier, mode, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        if (cv.contourArea(c) >= imgArea * 0.06) {
          const peri = cv.arcLength(c, true);
          const hull = new cv.Mat();
          cv.convexHull(c, hull);
          for (const eps of [0.02, 0.03, 0.05]) {
            const approx = new cv.Mat();
            cv.approxPolyDP(hull, approx, eps * peri, true);
            const four = approx.rows === 4;
            if (four) {
              const pts: Pt[] = [];
              for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
              add(pts);
            }
            approx.delete();
            if (four) break;
          }
          hull.delete();
          // The tightest tilted rectangle around the outline: a good start for cards.
          const r = cv.minAreaRect(c);
          const cs = Math.cos(r.angle * DEG), sn = Math.sin(r.angle * DEG), hw = r.size.width / 2, hh = r.size.height / 2;
          add([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: r.center.x + x * cs - y * sn, y: r.center.y + x * sn + y * cs })));
        }
        c.delete();
      }
    };

    let best: Scored | null = null;
    // Clear edges first; fainter ones only if nothing convincing was found.
    for (const [lo, hi] of [[50, 150], [20, 60]] as const) {
      const edges = keep(new cv.Mat());
      cv.Canny(gray, edges, lo, hi);
      cv.bitwise_or(edges, colour, edges);

      const thick = keep(new cv.Mat());
      cv.dilate(edges, thick, k5);
      cv.morphologyEx(thick, thick, cv.MORPH_CLOSE, k5);
      guesses(thick, cv.RETR_LIST);
      if (lo === 50) {
        // Bright page on a darker table, or the other way round.
        for (const type of [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]) {
          const bw = keep(new cv.Mat());
          cv.threshold(gray, bw, 0, 255, type + cv.THRESH_OTSU);
          cv.morphologyEx(bw, bw, cv.MORPH_OPEN, k5);
          guesses(bw, cv.RETR_EXTERNAL);
        }
      }

      const d: Uint8Array = edges.data;
      let n = 0;
      for (let i = 0; i < d.length; i++) if (d[i]) n++;
      const ex = new Int16Array(n), ey = new Int16Array(n);
      for (let i = 0, j = 0; i < d.length; i++) if (d[i]) { ex[j] = i % W; ey[j++] = (i / W) | 0; }

      for (const q of rough) {
        const r = refine(ex, ey, q, W, H);
        if (r && (!best || r.score > best.score)) best = r;
      }
      if (best && best.cover >= 0.4) break;
    }

    if (!best) return { quad: fullQuad(src.width, src.height, 0.04), found: false };
    // Pull corners in slightly so the table edge does not show in the result.
    const b = best.quad;
    const cx = b.reduce((a, p) => a + p.x, 0) / 4, cy = b.reduce((a, p) => a + p.y, 0) / 4;
    const quad = b.map((p) => ({ x: (p.x + (cx - p.x) * 0.004) / s, y: (p.y + (cy - p.y) * 0.004) / s })) as Quad;
    return { quad, found: true };
  } finally {
    for (const m of mats) { try { m.delete(); } catch { /* already freed */ } }
  }
}
