// Live page outline on the camera. Small frames go to the page finder a few times a second;
// the corners it finds are checked, smoothed and drawn over the picture. A page that stays
// put for a moment is "steady", which Auto capture uses to take the photo by itself.
import type { Pt, Quad } from "./geometry";

export type OutlineState = "none" | "found" | "steady";

/** Corners found on a frame (fw x fh) placed on a box that shows it with object-fit: cover. */
export function coverMap(q: Quad, fw: number, fh: number, bw: number, bh: number): Quad {
  const s = Math.max(bw / fw, bh / fh);
  const ox = (bw - fw * s) / 2, oy = (bh - fh * s) / 2;
  return q.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy })) as Quad;
}

function area(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; }
  return Math.abs(a) / 2;
}

/** A believable page: a tenth of the picture or more, four corners turning the same way, no tiny side. */
export function plausible(q: Quad, w: number, h: number): boolean {
  if (area(q) < 0.1 * w * h) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const s = Math.sign(cross);
    if (!s || (sign && s !== sign)) return false;
    sign = s;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.08 * Math.min(w, h)) return false;
  }
  return true;
}

const far = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Follows the page from frame to frame. A small move is smoothed so the outline does not
 * shake; a big jump means another page and the outline goes straight there. A page missed
 * on a frame or two is kept for `hold` ms so the outline does not blink.
 */
export class OutlineTracker {
  private q: Quad | null = null;
  private stillSince = 0;
  private lostAt = 0;
  constructor(private hold = 450, private steadyMs = 900) {}

  update(found: Quad | null, w: number, h: number, now: number): { quad: Quad | null; state: OutlineState } {
    const diag = Math.hypot(w, h);
    if (found && plausible(found, w, h)) {
      const move = this.q ? far(this.q, found) / diag : Infinity;
      if (!this.q || move > 0.12) {
        this.q = found;
        this.stillSince = now;
      } else {
        const prev = this.q;
        this.q = prev.map((p, i) => mix(p, found[i], 0.55)) as Quad;
        if (move > 0.02) this.stillSince = now;
      }
      this.lostAt = 0;
    } else if (this.q) {
      if (!this.lostAt) this.lostAt = now;
      if (now - this.lostAt > this.hold) { this.q = null; this.stillSince = 0; this.lostAt = 0; }
    }
    const state: OutlineState = !this.q ? "none" : !this.lostAt && now - this.stillSince >= this.steadyMs ? "steady" : "found";
    return { quad: this.q, state };
  }

  reset() { this.q = null; this.stillSince = 0; this.lostAt = 0; }
}

/** How different two small frames are (mean change of green, 0 to 255), on every 7th pixel. */
export function frameChange(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return 255;
  let d = 0, n = 0;
  for (let i = 1; i < a.length; i += 28) { d += Math.abs(a[i] - b[i]); n++; }
  return n ? d / n : 0;
}

/**
 * Auto capture for flat pages: one photo when the page is steady. The next one waits for a
 * new page: the outline lost in between (the page taken away), or the picture clearly different.
 */
export class AutoShot {
  private lastShot = -Infinity;
  private shotFrame: Uint8ClampedArray | null = null;
  private sawNone = false;
  constructor(private gap = 1500, private change = 22) {}

  /** True when this frame should take the photo. */
  next(state: OutlineState, frame: Uint8ClampedArray, now: number): boolean {
    if (state === "none") { this.sawNone = true; return false; }
    if (state !== "steady" || now - this.lastShot < this.gap) return false;
    if (this.shotFrame && !this.sawNone && frameChange(this.shotFrame, frame) < this.change) return false;
    this.sawNone = false;
    this.lastShot = now;
    this.shotFrame = frame.slice();
    return true;
  }

  /** A photo was taken and the same page is still there: waiting for the next page. */
  get waiting(): boolean { return this.shotFrame !== null && !this.sawNone; }

  reset() { this.lastShot = -Infinity; this.shotFrame = null; this.sawNone = false; }
}
