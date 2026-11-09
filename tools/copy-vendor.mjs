// Copies the large runtime files the app loads on demand into public/vendor.
import { cpSync, mkdirSync } from "node:fs";
const nm = "node_modules/";
const v = "public/vendor/";
mkdirSync(v + "tesseract/core", { recursive: true });
mkdirSync(v + "tesseract/lang", { recursive: true });
cpSync(nm + "@techstark/opencv-js/dist/opencv.js", v + "opencv.js");
cpSync(nm + "tesseract.js/dist/worker.min.js", v + "tesseract/worker.min.js");
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"])
  cpSync(nm + "tesseract.js-core/" + f, v + "tesseract/core/" + f);
for (const l of ["eng", "ara"])
  cpSync(`${nm}@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${v}tesseract/lang/${l}.traineddata.gz`);
console.log("vendor files copied");
