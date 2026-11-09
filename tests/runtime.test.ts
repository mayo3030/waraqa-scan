// Locks the Android workarounds that were leaving the app stuck.
import { tesseractOptions } from "../src/lib/ocr-config";
import { runJob } from "../src/lib/engine-job";
import { finish, flatten } from "../src/lib/pipeline";
import { fullQuad } from "../src/lib/geometry";
import { NO_ADJUST } from "../src/lib/filters";

let bad = 0;
function check(name: string, ok: boolean) {
  if (!ok) { bad++; console.log("FAIL", name); }
}

const native = tesseractOptions(true);
check("native reads unpacked language files", native.gzip === false);
check("native does not use the worker database", native.cacheMethod === "none");
check("native uses the non-SIMD reader", native.corePath.endsWith("tesseract-core-lstm.wasm.js") && !native.corePath.includes("simd"));

const web = tesseractOptions(false);
check("web still reads gzip language files", web.gzip === true);
check("web keeps the normal language cache", web.cacheMethod === undefined);
check("web can pick a SIMD build", web.corePath.endsWith("vendor/tesseract/core"));

const w = 8, h = 6;
const data = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < data.length; i++) data[i] = (i * 17) & 255;
const src = { width: w, height: h, data };
const quad = fullQuad(w, h, 0.05);
const flat = runJob({ op: "flatten", src, quad, rotation: 1 }, null).raster!;
const direct = flatten(src, quad, 1);
check("worker flatten matches", flat.width === direct.width && flat.height === direct.height
  && flat.data.length === direct.data.length && flat.data.every((v, i) => v === direct.data[i]));
const cleaned = runJob({ op: "finish", src: flat, filter: "enhance", adjust: NO_ADJUST }, null).raster!;
const directClean = finish(direct, "enhance", NO_ADJUST);
check("worker filter matches", cleaned.width === directClean.width && cleaned.data.length === directClean.data.length
  && cleaned.data.every((v, i) => v === directClean.data[i]));

console.log(bad ? `${bad} runtime check(s) failed` : "PASS runtime guards");
process.exit(bad ? 1 : 0);
