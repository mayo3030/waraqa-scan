// Word and Excel files open as zip packages with the read text inside.
import { toDocx, toXlsx } from "../src/lib/exporters";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };

const docx = await toDocx("Test", ["Hello world\nسطر عربي", "Page two"], [], false);
const db = new Uint8Array(await docx.arrayBuffer());
check("docx is a zip", db[0] === 0x50 && db[1] === 0x4b);
check("docx has size", db.length > 2000);

const xlsx = await toXlsx(["Item  Qty\nTea  2"]);
const xb = new Uint8Array(await xlsx.arrayBuffer());
check("xlsx is a zip", xb[0] === 0x50 && xb[1] === 0x4b);

if (bad) { console.log(bad + " export checks failed"); process.exit(1); }
console.log("exports: all checks passed");
