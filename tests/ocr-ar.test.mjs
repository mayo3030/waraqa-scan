// Checks that the bundled Arabic language data loads and reads a simple page.
import { createWorker, OEM, PSM } from "tesseract.js";
const w = await createWorker(["ara"], OEM.LSTM_ONLY, { langPath: process.cwd() + "/public/vendor/tesseract/lang", gzip: true, cachePath: process.env.TMPDIR || "/tmp" });
await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: "1" });
const r = await w.recognize("tests/fixtures/arabic-flat.png");
console.log(r.data.text);
const need = ["عقد", "سيارة", "البائع", "البيع"];
const miss = need.filter((n) => !r.data.text.includes(n));
console.log(miss.length ? "MISSING: " + miss.join(" | ") : "PASS: Arabic words read");
await w.terminate();
process.exit(miss.length ? 1 : 0);
