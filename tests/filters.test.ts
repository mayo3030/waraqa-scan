// The page filters on synthetic pages: shadows go, colour casts go, ink stays dark,
// photos keep their colours, edges get sharper, and Auto picks the right one.
import { applyFilter, autoPick, FILTERS, sharpen } from "../src/lib/filters";
import { flatten, MIN_SIDE } from "../src/lib/pipeline";
import type { Raster } from "../src/lib/geometry";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const px = (r: Raster, x: number, y: number) => (y * r.width + x) * 4;
const mean = (r: Raster, x0: number, y0: number, x1: number, y1: number) => {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum(r.data, px(r, x, y)); n++; }
  return s / n;
};

// A white page under a warm lamp, darker on the right (a hand's shadow), with black text lines.
function shadowedPage(w = 900, h = 1200): Raster {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const light = 1 - 0.45 * (x / w);
    const text = y % 60 > 40 && y % 60 < 50 && x > 80 && x < w - 80 && (x % 37) < 30;
    const v = text ? 35 : 238;
    d[i] = v * light; d[i + 1] = v * light * 0.93; d[i + 2] = v * light * 0.8; d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

// A colourful picture: smooth gradients of hue and brightness.
function picture(w = 800, h = 600): Raster {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = 60 + 140 * (x / w); d[i + 1] = 50 + 120 * (y / h); d[i + 2] = 150 - 100 * (x / w) * (y / h); d[i + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

const page = shadowedPage();
const copy = (r: Raster): Raster => ({ ...r, data: new Uint8ClampedArray(r.data) });

// Magic Color
const m = applyFilter(copy(page), "enhance");
check(`magic: lit paper white (${mean(m, 20, 5, 70, 30).toFixed(0)})`, mean(m, 20, 5, 70, 30) > 245);
check(`magic: shadowed paper white too (${mean(m, 830, 5, 880, 30).toFixed(0)})`, mean(m, 830, 5, 880, 30) > 240);
check(`magic: ink dark in the shadow (${mean(m, 703, 42, 725, 48).toFixed(0)})`, mean(m, 703, 42, 725, 48) < 70);
const pi = px(m, 850, 20);
check(`magic: warm cast gone (r-b ${m.data[pi] - m.data[pi + 2]})`, Math.abs(m.data[pi] - m.data[pi + 2]) < 10);

// No Shadow evens light but keeps the page's colour
const ns = applyFilter(copy(page), "noshadow");
check(`no shadow: both sides alike (${mean(ns, 20, 5, 70, 30).toFixed(0)} vs ${mean(ns, 830, 5, 880, 30).toFixed(0)})`, Math.abs(mean(ns, 20, 5, 70, 30) - mean(ns, 830, 5, 880, 30)) < 15);

// B&W is pure black and white, text black on both sides
const b = applyFilter(copy(page), "bw");
let grays = 0;
for (let i = 0; i < b.data.length; i += 4) if (b.data[i] !== 0 && b.data[i] !== 255) grays++;
check("bw: only black and white", grays === 0);
check("bw: text black in the shadow", b.data[px(b, 703, 45)] === 0 && b.data[px(b, 100, 45)] === 0);
check("bw: paper white in the shadow", b.data[px(b, 850, 20)] === 255);

// Photo keeps hues and widens the range without blowing out
const pic = picture();
const ph = applyFilter(copy(pic), "photo");
const hue = (d: Uint8ClampedArray, i: number) => Math.atan2(Math.sqrt(3) * (d[i + 1] - d[i + 2]), 2 * d[i] - d[i + 1] - d[i + 2]);
let drift = 0, n = 0;
for (let y = 50; y < 550; y += 50) for (let x = 50; x < 750; x += 50) {
  const i = px(pic, x, y);
  let dh = Math.abs(hue(ph.data, i) - hue(pic.data, i));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  drift += dh; n++;
}
check(`photo: colours keep their hue (avg drift ${(drift / n).toFixed(2)} rad)`, drift / n < 0.25);
let lo = 255, hi = 0, plo = 255, phi = 0;
for (let i = 0; i < ph.data.length; i += 4 * 97) { const v = lum(ph.data, i), u = lum(pic.data, i); lo = Math.min(lo, v); hi = Math.max(hi, v); plo = Math.min(plo, u); phi = Math.max(phi, u); }
check(`photo: wider range (${(hi - lo).toFixed(0)} vs ${(phi - plo).toFixed(0)})`, hi - lo > phi - plo + 20);
check(`photo: middle not blown out (${mean(ph, 350, 250, 450, 350).toFixed(0)})`, mean(ph, 350, 250, 450, 350) > 70 && mean(ph, 350, 250, 450, 350) < 210);

// Sharpen makes a soft edge steeper
const edge = { width: 60, height: 10, data: new Uint8ClampedArray(60 * 10 * 4) };
for (let y = 0; y < 10; y++) for (let x = 0; x < 60; x++) { const i = (y * 60 + x) * 4; const v = 60 + 140 / (1 + Math.exp(-(x - 30) / 2.5)); edge.data[i] = edge.data[i + 1] = edge.data[i + 2] = v; edge.data[i + 3] = 255; }
const steep = (r: Raster) => r.data[px(r, 31, 5)] - r.data[px(r, 29, 5)];
const before = steep(edge);
check(`sharpen: edge steeper (${before} -> ${steep(sharpen(copy(edge), 2, 1, 0))})`, steep(sharpen(copy(edge), 2, 1, 0)) > before * 1.1);

// Auto
check(`auto: a paper is Magic Color (${autoPick(page)})`, autoPick(page) === "enhance");
check(`auto: a picture is Photo (${autoPick(pic)})`, autoPick(pic) === "photo");

// Every filter: same size, opaque, input untouched, quick enough for a phone
const before0 = page.data.slice();
for (const f of FILTERS) {
  const t = Date.now();
  const r = applyFilter(page, f.id);
  const ms = Date.now() - t;
  let opaque = true;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] !== 255) { opaque = false; break; }
  check(`${f.id}: size kept`, r.width === page.width && r.height === page.height);
  check(`${f.id}: opaque`, opaque);
  check(`${f.id}: under 1.5 s on 1 MP (${ms} ms)`, ms < 1500);
}
check("filters leave the input alone", page.data.every((v, i) => v === before0[i]));

// Small pages are enlarged a little; big ones are not
const small = flatten(picture(500, 400), [{ x: 0, y: 0 }, { x: 499, y: 0 }, { x: 499, y: 399 }, { x: 0, y: 399 }], 0);
check(`small page enlarged (${small.width}x${small.height})`, small.width >= 795 && small.height >= 636);
const big = flatten(picture(1800, 1200), [{ x: 0, y: 0 }, { x: 1799, y: 0 }, { x: 1799, y: 1199 }, { x: 0, y: 1199 }], 0);
check(`big page kept (${big.width})`, big.width >= MIN_SIDE && big.width <= 1800);

if (bad) { console.log(bad + " filter checks failed"); process.exit(1); }
console.log("filters: all checks passed");
