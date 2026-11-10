// Runs detection, flattening and filters on the photographed fixtures.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { detectPage } from "../src/lib/detect";
import { warpPerspective, outputSize, dist, type Raster } from "../src/lib/geometry";
import { applyFilter } from "../src/lib/filters";

const require = createRequire(import.meta.url);
const dir = process.cwd() + "/tests/fixtures/";
const outDir = process.env.OUT_DIR || dir + "out/";
mkdirSync(outDir, { recursive: true });

function load(name: string): Raster {
  const b = readFileSync(dir + name + ".rgba");
  const w = b.readUInt32LE(0), h = b.readUInt32LE(4);
  return { width: w, height: h, data: new Uint8ClampedArray(b.buffer, b.byteOffset + 8, w * h * 4) };
}
function save(name: string, r: Raster) {
  const head = Buffer.alloc(8); head.writeUInt32LE(r.width, 0); head.writeUInt32LE(r.height, 4);
  writeFileSync(outDir + name + ".rgba", Buffer.concat([head, Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength)]));
}

async function main() {
  let cv = require("@techstark/opencv-js");
  if (cv instanceof Promise) cv = await cv;
  else if (!cv.Mat) await new Promise<void>((res) => (cv.onRuntimeInitialized = () => res()));
  const truth = JSON.parse(readFileSync(dir + "truth.json", "utf8"));
  let failed = 0;
  for (const name of Object.keys(truth)) {
    const src = load(name);
    const t0 = Date.now();
    const det = detectPage(cv, src);
    const t1 = Date.now();
    const errs = det.quad.map((p, i) => dist(p, { x: truth[name][i][0], y: truth[name][i][1] }));
    const maxErr = Math.max(...errs);
    // Within 1% of the longer side: about 4 px on the phone's screen.
    const ok = det.found && maxErr < Math.max(src.width, src.height) * 0.01;
    if (!ok) failed++;
    const { w, h } = outputSize(det.quad);
    const flat = warpPerspective(src, det.quad, w, h);
    const t2 = Date.now();
    save(name + ".flat", flat);
    for (const f of ["enhance", "bw", "gray"] as const) save(`${name}.${f}`, applyFilter(flat, f));
    const t3 = Date.now();
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: found=${det.found} maxCornerErr=${maxErr.toFixed(1)}px detect=${t1 - t0}ms warp=${t2 - t1}ms filters=${t3 - t2}ms out=${w}x${h}`);
  }
  if (failed) { console.error(`${failed} detection(s) failed`); process.exit(1); }
}
main();
