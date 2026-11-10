// Flash glare: found on a shiny card, not on white paper; two photos with the shine in
// different places are lined up and joined into one clean card.
import { findGlare, findShift, mergeGlare } from "../src/lib/deglare";
import type { Raster } from "../src/lib/geometry";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } else if (process.env.VERBOSE) console.log("ok", name); };
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// A made-up card: pale blue to sand background, fine printed lines, a dark photo box, text lines.
function card(w = 1000, h = 630): Raster {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const t = x / w;
    let r = 205 + 25 * t, g = 210 + 5 * t, b = 230 - 70 * t;
    if ((x + 2 * y) % 9 < 2) { r -= 18; g -= 18; b -= 12; } // fine security print
    const photo = x > 60 && x < 300 && y > 90 && y < 400;
    if (photo) { const v = 70 + 60 * Math.sin(x / 23) * Math.cos(y / 31); r = g = b = v; }
    const text = x > 360 && x < w - 60 && y % 70 > 44 && y % 70 < 58 && (x % 29) < 21;
    if (text) { r = 30; g = 28; b = 35; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

/** Adds a flash spot: a white veil that burns the middle to pure white. */
function glare(src: Raster, cx: number, cy: number, sigma: number): Raster {
  const { width: w, height: h } = src;
  const d = new Uint8ClampedArray(src.data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.min(1, 1.6 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma)));
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] * (1 - v) + 255 * v;
  }
  return { width: w, height: h, data: d };
}

/** The same card moved by (dx, dy), a little darker and a little soft (hand-held second photo). */
function moved(src: Raster, dx: number, dy: number, gain: number): Raster {
  const { width: w, height: h, data } = src;
  const d = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = [0, 0, 0], n = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const sx = Math.min(w - 1, Math.max(0, x - dx + ox)), sy = Math.min(h - 1, Math.max(0, y - dy + oy));
      const k = (sy * w + sx) * 4;
      acc = [acc[0] + data[k], acc[1] + data[k + 1], acc[2] + data[k + 2]]; n++;
    }
    const i = (y * w + x) * 4;
    d[i] = (acc[0] / n) * gain; d[i + 1] = (acc[1] / n) * gain; d[i + 2] = (acc[2] / n) * gain; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

function err(a: Raster, b: Raster, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.width + x) * 4; s += Math.abs(lum(a.data, i) - lum(b.data, i)); n++; }
  return s / n;
}

const clean = card();
const a = glare(clean, 780, 130, 70); // shine top right
const b = moved(glare(clean, 450, 470, 70), 3, -2, 0.92); // shine lower middle, second photo

// Finding glare
const ga = findGlare(a), gc = findGlare(clean);
check(`glare found on the shiny card (${(ga.fraction * 100).toFixed(2)}%)`, ga.found);
check(`no glare on the clean card (${(gc.fraction * 100).toFixed(2)}%)`, !gc.found);
const paper: Raster = (() => {
  const w = 900, h = 1200, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, t = y % 50 > 36 && x > 80 && x < 820 && x % 31 < 24;
    d[i] = d[i + 1] = d[i + 2] = t ? 30 : 250; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
})();
check("a white page is not glare", !findGlare(paper).found);

// Lining up
const [dx, dy] = findShift(a, b);
check(`second photo lined up (found ${dx}, ${dy}; moved 3, -2)`, dx === 3 && dy === -2);

// Joining
const t0 = Date.now();
const m = mergeGlare([a, b]);
const ms = Date.now() - t0;
check("same size", m.width === clean.width && m.height === clean.height);
const spotA = [720, 70, 840, 190] as const, spotB = [390, 410, 510, 530] as const;
const before = err(a, clean, ...spotA);
const afterA = err(m, clean, ...spotA), afterB = err(m, clean, ...spotB);
check(`glare was there to fix (${before.toFixed(1)})`, before > 40);
check(`top-right glare gone (${afterA.toFixed(1)})`, afterA < 12);
check(`second photo's glare not brought in (${afterB.toFixed(1)})`, afterB < 12);
// The soft edge of the shine goes too, not just its white middle (no ring left behind).
// (The second photo is a little soft, so where it is used the error cannot go below its own.)
const ring = err(m, clean, 620, 10, 940, 290), floor = err(moved(clean, 0, 0, 1), clean, 620, 10, 940, 290);
check(`no ring around the old shine (${ring.toFixed(1)}, soft photo alone ${floor.toFixed(1)})`, ring < floor + 2);
const rest = err(m, clean, 380, 220, 640, 400);
check(`clean text left sharp and unchanged (${rest.toFixed(1)})`, rest < 4);
check(`whole card close to the clean one (${err(m, clean, 10, 10, 990, 620).toFixed(1)})`, err(m, clean, 10, 10, 990, 620) < 6);
check(`under 3 s for a 0.6 MP card (${ms} ms)`, ms < 3000);
let opaque = true;
for (let i = 3; i < m.data.length; i += 4) if (m.data[i] !== 255) { opaque = false; break; }
check("opaque", opaque);

// Corners found a few pixels off: the second photo is a little bigger (0.8%), so the
// shift is different in each part of the card. Tiles line it up piece by piece.
function zoomed(src: Raster, k: number): Raster {
  const { width: w, height: h, data } = src;
  const d = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(w - 1, Math.max(0, Math.round((x - w / 2) / k + w / 2)));
    const sy = Math.min(h - 1, Math.max(0, Math.round((y - h / 2) / k + h / 2)));
    const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
    d[i] = data[j]; d[i + 1] = data[j + 1]; d[i + 2] = data[j + 2]; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}
const c2 = moved(zoomed(glare(clean, 300, 500, 70), 1.008), 0, 0, 1);
const m2 = mergeGlare([a, c2]);
const z = err(m2, clean, ...spotA);
check(`glare gone with a slightly bigger second photo (${z.toFixed(1)})`, z < 12);

// Odd inputs
check("one photo comes back as it is", mergeGlare([a]) === a);
check("photos of different sizes: the first is kept", mergeGlare([a, card(800, 500)]) === a);

if (bad) { console.log(bad + " glare checks failed"); process.exit(1); }
console.log("deglare: all checks passed");
