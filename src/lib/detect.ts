// Finds the page outline in a photo with OpenCV.js.
// `cv` is the loaded OpenCV.js module (window.cv in the browser).
import { fullQuad, isConvex, orderQuad, quadArea, type Pt, type Quad, type Raster } from "./geometry";

/* eslint-disable @typescript-eslint/no-explicit-any */
type CV = any;

export interface Detection {
  quad: Quad;
  found: boolean; // false when we fell back to the whole image
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

    let best: Quad | null = null;
    let bestScore = 0;

    // Try a few edge settings; keep the largest convex 4-corner shape.
    const attempts: [number, number][] = [[50, 150], [30, 100], [75, 200], [15, 60]];
    for (const [lo, hi] of attempts) {
      const edges = keep(new cv.Mat());
      cv.Canny(gray, edges, lo, hi);
      const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
      cv.dilate(edges, edges, kernel);
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
      const contours = keep(new cv.MatVector());
      const hier = keep(new cv.Mat());
      cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        if (area < imgArea * 0.12) { c.delete(); continue; }
        const peri = cv.arcLength(c, true);
        const hull = new cv.Mat();
        cv.convexHull(c, hull);
        let quad: Pt[] | null = null;
        for (const eps of [0.02, 0.03, 0.05]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) {
            quad = [];
            for (let k = 0; k < 4; k++) quad.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
          }
          approx.delete();
          if (quad) break;
        }
        hull.delete();
        c.delete();
        if (!quad) continue;
        const q = orderQuad(quad);
        if (!isConvex(q)) continue;
        const a = quadArea(q);
        // A shape hugging the whole frame is usually the photo border.
        const touches = q.filter((p) => p.x < 2 || p.y < 2 || p.x > W - 3 || p.y > H - 3).length;
        const score = a * (touches >= 3 ? 0.4 : 1);
        if (score > bestScore) { bestScore = score; best = q; }
      }
      if (best && quadArea(best) > imgArea * 0.25) break;
    }

    if (!best) return { quad: fullQuad(src.width, src.height, 0.04), found: false };
    // Pull corners in slightly so the table edge does not show in the result.
    const cx = best.reduce((a, p) => a + p.x, 0) / 4, cy = best.reduce((a, p) => a + p.y, 0) / 4;
    const quad = best.map((p) => ({ x: (p.x + (cx - p.x) * 0.012) / s, y: (p.y + (cy - p.y) * 0.012) / s })) as Quad;
    return { quad, found: true };
  } finally {
    for (const m of mats) { try { m.delete(); } catch { /* already freed */ } }
  }
}
