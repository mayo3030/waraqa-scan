// Checks counting, colorize, despeckle, passport sheets, question splitting and language guess.
import { blank, CARD_MM, colorize, countObjects, despeckle, idCardSheet } from "../src/lib/imaging";
import { splitQuestions } from "../src/lib/questions";
import { guessSource, onlineTranslateUrl } from "../src/lib/translate";
import type { Raster } from "../src/lib/geometry";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };

const fill = (r: Raster, v: number) => { for (let i = 0; i < r.data.length; i += 4) { r.data[i] = r.data[i + 1] = r.data[i + 2] = v; r.data[i + 3] = 255; } };
const disc = (r: Raster, cx: number, cy: number, rad: number, v: number) => {
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad || x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
    const i = (y * r.width + x) * 4;
    r.data[i] = r.data[i + 1] = r.data[i + 2] = v;
  }
};

// CountCam: 12 dark coins on light paper, plus one pair touching.
const img = blank(400, 300);
fill(img, 225);
let n = 0;
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) { disc(img, 50 + col * 95, 50 + row * 95, 22, 40); n++; }
check(`count 12 coins (got ${countObjects(img).total})`, countObjects(img).total === n);
disc(img, 360, 280, 12, 40);
check("count small extra object", countObjects(img).total === n + 1 || countObjects(img).total === n);
const empty = blank(200, 200);
fill(empty, 230);
check("count empty page is 0", countObjects(empty).total === 0);

// Despeckle: a single white speck on gray goes away, edges stay.
const g = blank(40, 40);
fill(g, 100);
let i = (20 * 40 + 20) * 4;
g.data[i] = g.data[i + 1] = g.data[i + 2] = 255;
const d = despeckle(g);
check("despeckle removes speck", d.data[i] < 140);

// Colorize: gray mid-tones get a warm tint.
const m = blank(64, 20);
for (let y = 0; y < 20; y++) for (let x = 0; x < 64; x++) { const k = (y * 64 + x) * 4; m.data[k] = m.data[k + 1] = m.data[k + 2] = x * 4; m.data[k + 3] = 255; }
const col = colorize(m);
i = (10 * 64 + 34) * 4;
check(`colorize warms mid-tones (r ${col.data[i]} b ${col.data[i + 2]})`, col.data[i] > col.data[i + 2] + 15);

// Passport page sheet at 125 x 88 mm (200 dpi): card fills that box.
const pp = blank(500, 352);
fill(pp, 60);
const sheet = idCardSheet([pp], "a4", CARD_MM.passport);
check("passport sheet a4", sheet.width === 1654 && sheet.height === 2339);
let dark = 0;
for (let y = 0; y < sheet.height; y += 4) { const k = (y * sheet.width + Math.round(sheet.width / 2)) * 4; if (sheet.data[k] < 100) dark++; }
const tall = dark * 4;
check(`passport printed about 693 px tall (got ${tall})`, Math.abs(tall - Math.round((88 / 25.4) * 200)) < 20);

// Incorrect Question: numbered questions in English and Arabic.
const qs = splitQuestions("Math test\nName: ____\n1. What is 2+2?\na) 3 b) 4\n2) Solve x+1=3\n3- Draw a circle\n");
check(`split english questions (got ${qs.length})`, qs.length === 3 && qs[0].includes("a) 3"));
const ar = splitQuestions("امتحان\nس1 ما عاصمة مصر؟\nس2 اكتب جملة\n٣. احسب ٥+٥");
check(`split arabic questions (got ${ar.length})`, ar.length === 3);
check("no numbers: split by paragraphs", splitQuestions("first question here\n\nsecond one here").length === 2);

check("guess arabic", guessSource("مرحبا بكم في التطبيق") === "ar");
check("guess english", guessSource("Hello there") === "en");
check("translate link", onlineTranslateUrl("a b", "ar").startsWith("https://translate.google.com/?sl=auto&tl=ar"));

if (bad) { console.log(`${bad} failed`); process.exit(1); }
console.log("modes tests passed");
