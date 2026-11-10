// Checks the new on-device image tools with small synthetic images.
import { blank, crop, idCardSheet, inpaint, photoSheet, PHOTO_SIZES, splitSpread, stackPages, stitchVertical, eraseMarks, whiteboard, restorePhoto } from "../src/lib/imaging";
import { runJob } from "../src/lib/engine-job";
import { textToTable, cellValue } from "../src/lib/tableparse";
import type { Raster } from "../src/lib/geometry";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };

// A "page": rows of noise so overlaps can be matched.
function noisePage(w: number, h: number, seed = 1): Raster {
  const r = blank(w, h);
  let s = seed;
  for (let y = 0; y < h; y++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 40 + (s % 200);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (v + ((x * 7 + y * 3) % 30)) & 255;
      r.data[i] = r.data[i + 1] = r.data[i + 2] = n;
    }
  }
  return r;
}

// Mega scan: three overlapping shots of one tall page join back to near its height.
const tall = noisePage(120, 600);
const a = crop(tall, 0, 0, 120, 260), b = crop(tall, 0, 180, 120, 260), c = crop(tall, 0, 340, 120, 260);
const joined = stitchVertical([a, b, c]);
check(`stitch height near 600 (got ${joined.height})`, Math.abs(joined.height - 600) <= 12);
check("stitch keeps width", joined.width === 120);

// ID card sheet is a letter page at 200 dpi.
const card = noisePage(300, 190);
const sheet = idCardSheet([card, card], "letter");
check("id sheet letter size", sheet.width === 1700 && sheet.height === 2200);
const sheetA4 = idCardSheet([card], "a4");
check("id sheet a4 size", sheetA4.width === 1654 && sheetA4.height === 2339);

// ID photo: single photo at the right pixel size, sheet 6 x 4 in.
const face = noisePage(400, 600);
const p2 = photoSheet(face, PHOTO_SIZES[0]);
check("2x2 photo size", p2.single.width === 402 && p2.single.height === 402);
check("4x6 sheet", p2.sheet.width === 1200 && p2.sheet.height === 800);
const job = runJob({ op: "idphoto", src: face, size: "35x45" }, null);
check("idphoto job returns two images", job.rasters?.length === 2 && job.rasters[0].width === 276);

// Book: a dark spine in the middle splits into two halves.
const spread = blank(400, 200);
for (let y = 0; y < 200; y++) for (let x = 196; x < 204; x++) { const i = (y * 400 + x) * 4; spread.data[i] = spread.data[i + 1] = spread.data[i + 2] = 20; }
const [left, right] = splitSpread(spread);
check(`split at the spine (${left.width}+${right.width})`, Math.abs(left.width - 200) <= 6 && left.width + right.width <= 400);

// Long image: pages one under another with gaps.
const long = stackPages([blank(100, 140), blank(200, 280)], 400, 10);
check("stack width", long.width === 400);
check(`stack height (${long.height})`, long.height === 560 + 560 + 10);

// Smart erase: a black square on white paper becomes paper again.
const paper = blank(60, 60);
const mask = new Uint8Array(60 * 60);
for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) { const i = (y * 60 + x) * 4; paper.data[i] = paper.data[i + 1] = paper.data[i + 2] = 0; mask[y * 60 + x] = 1; }
const healed = inpaint(paper, mask);
const mid = (30 * 60 + 30) * 4;
check(`inpaint fills from the paper (${healed.data[mid]})`, healed.data[mid] > 240);

// Tools run and keep the size.
for (const [n, f] of [["eraseMarks", eraseMarks], ["whiteboard", whiteboard], ["restore", restorePhoto]] as const) {
  const out = f(noisePage(50, 40));
  check(n + " keeps size", out.width === 50 && out.height === 40);
}
// Blue pen marks on white paper are removed.
const pen = blank(20, 20);
for (let x = 0; x < 20; x++) { const i = (10 * 20 + x) * 4; pen.data[i] = 30; pen.data[i + 1] = 60; pen.data[i + 2] = 200; }
const clean = eraseMarks(pen);
const pi = (10 * 20 + 5) * 4;
check(`blue ink erased (${clean.data[pi]},${clean.data[pi + 1]},${clean.data[pi + 2]})`, clean.data[pi] > 200 && clean.data[pi + 2] > 200);

// Excel guess.
const t = textToTable("Item   Qty   Price\nTea\t2\t$3.50\nBread | 1 | 1,200");
check("table rows", t.length === 3);
check("table cols", t.every((r) => r.length === 3));
check("numbers become numbers", cellValue("3.50") === 3.5 && cellValue("$1,200") === 1200 && cellValue("Tea") === "Tea");

if (bad) { console.log(bad + " imaging checks failed"); process.exit(1); }
console.log("imaging: all checks passed");
