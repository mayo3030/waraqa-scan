// The invisible text layer: words written into a PDF come back out as searchable text.
import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addTextLayer, wordsFromText } from "../src/lib/pdftext";
import type { OcrWord } from "../src/lib/store";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };

const font = async () => readFileSync("node_modules/@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf").toString("base64");
const noFont = async () => null;
const box = { x: 0, y: 0, w: 210, h: 297 };

async function textOf(pdf: jsPDF): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(pdf.output("arraybuffer")), verbosity: 0 }).promise;
  let all = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    all += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  // Viewers fold Arabic presentation forms the same way when they search.
  return all.normalize("NFKC").replace(/\s+/g, " ");
}

const words: OcrWord[] = [
  ["BILL", 0.1, 0.1, 0.2, 0.13], ["OF", 0.22, 0.1, 0.27, 0.13], ["SALE", 0.29, 0.1, 0.4, 0.13],
  ["$17,450.00", 0.5, 0.3, 0.7, 0.32], ["4T1B11HK5KU000000", 0.5, 0.35, 0.8, 0.37],
  ["عقد", 0.8, 0.5, 0.9, 0.53], ["الإيجار", 0.6, 0.5, 0.78, 0.53],
  ["", 0, 0, 0, 0], ["flat", 0.1, 0.6, 0.1, 0.6], // empty and zero-size boxes are skipped
];

const pdf = new jsPDF({ unit: "mm", format: "a4" });
const n = await addTextLayer(pdf, words, box, font);
check("7 words written", n === 7);
const t = await textOf(pdf);
check("English phrase found", t.includes("BILL OF SALE"));
check("price found", t.includes("$17,450.00"));
check("VIN found", t.includes("4T1B11HK5KU000000"));
check("Arabic words found", t.includes("عقد") && t.includes("الإيجار"));

// Without the Arabic font the English still goes in and nothing throws.
const pdf2 = new jsPDF({ unit: "mm", format: "a4" });
const n2 = await addTextLayer(pdf2, words, box, noFont);
check("5 Latin words without font", n2 === 5);
check("English still found", (await textOf(pdf2)).includes("BILL OF SALE"));

// Text with no positions still becomes searchable lines.
const lines = wordsFromText("Seller Example Motors LLC\n\nOdometer 48,210 miles");
check("lines to words", lines.length === 7 && lines.every(([w, x0, y0, x1, y1]) => w && x1 > x0 && y1 > y0 && x1 <= 1 && y1 <= 1));
const pdf3 = new jsPDF({ unit: "mm", format: "a4" });
await addTextLayer(pdf3, lines, box, noFont);
check("fallback text found", (await textOf(pdf3)).includes("Odometer 48,210 miles"));
check("empty text gives no words", wordsFromText("  \n ").length === 0);

if (bad) { console.log(bad + " pdf text checks failed"); process.exit(1); }
console.log("pdf text: all checks passed");
