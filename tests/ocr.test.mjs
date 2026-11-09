// Reads the cleaned-up fixture page with Tesseract.js and the bundled language data.
import { createWorker, OEM, PSM } from "tesseract.js";
const png = process.argv[2];
const w = await createWorker(["eng"], OEM.LSTM_ONLY, { langPath: process.cwd() + "/public/vendor/tesseract/lang", gzip: true, cachePath: process.env.TMPDIR || "/tmp" });
await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN }); // same as the app
const t0 = Date.now();
const r = await w.recognize(png);
console.log(`--- ${Date.now() - t0}ms ---\n` + r.data.text);
const need = ["BILL OF SALE", "Example Motors LLC", "4T1B11HK5KU000000", "$17,450.00", "November 9, 2026"];
const miss = need.filter((n) => !r.data.text.includes(n));
console.log(miss.length ? "MISSING: " + miss.join(" | ") : "PASS: all key fields read");
await w.terminate();
process.exit(miss.length ? 1 : 0);
