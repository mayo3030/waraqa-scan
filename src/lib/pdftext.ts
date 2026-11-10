// The invisible text layer that makes an exported PDF searchable and copyable.
// Each read word is written, unseen, on top of where it sits in the page image.
import type { jsPDF } from "jspdf";
import type { OcrWord } from "./store";

export const UNICODE_FONT = "plex";
/** Returns the Arabic-capable TTF as base64, or null when it cannot be loaded. */
export type FontLoader = () => Promise<string | null>;

const PT_PER_MM = 72 / 25.4;
// Helvetica covers these; everything else (Arabic and so on) needs the embedded font.
const isLatin1 = (s: string) => /^[\x20-\x7e\xa0-\xff]+$/.test(s);

async function ensureFont(pdf: jsPDF, load: FontLoader): Promise<boolean> {
  if (pdf.getFontList()[UNICODE_FONT]) return true;
  const b64 = await load().catch(() => null);
  if (!b64) return false;
  pdf.addFileToVFS("plex-arabic.ttf", b64);
  pdf.addFont("plex-arabic.ttf", UNICODE_FONT, "normal", undefined, "Identity-H");
  return true;
}

/**
 * Writes the words over the page image. box is where the image sits on the PDF page, in mm.
 * Returns how many words were written.
 */
export async function addTextLayer(
  pdf: jsPDF,
  words: OcrWord[],
  box: { x: number; y: number; w: number; h: number },
  loadFont: FontLoader,
): Promise<number> {
  let n = 0;
  let unicode: boolean | null = null;
  for (const [raw, x0, y0, x1, y1] of words) {
    const text = raw.trim();
    const lineH = (y1 - y0) * box.h;
    const target = (x1 - x0) * box.w;
    if (!text || !(lineH > 0) || !(target > 0)) continue;
    const latin = isLatin1(text);
    if (!latin) {
      unicode ??= await ensureFont(pdf, loadFont);
      if (!unicode) continue;
    }
    try {
      pdf.setFont(latin ? "helvetica" : UNICODE_FONT, "normal");
      pdf.setFontSize(Math.max(1, lineH * 0.78 * PT_PER_MM));
      const natural = pdf.getTextWidth(text);
      const scale = natural > 0 ? Math.min(5, Math.max(0.2, target / natural)) : 1;
      pdf.text(text, box.x + x0 * box.w, box.y + y0 * box.h + lineH * 0.8, { renderingMode: "invisible", horizontalScale: scale });
      n++;
    } catch { /* a glyph the font lacks: leave that word out */ }
  }
  pdf.setFont("helvetica", "normal");
  return n;
}

/** Used when the text is known but not where it sits: lines run down the page so search still finds them. */
export function wordsFromText(text: string): OcrWord[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 80);
  if (!lines.length) return [];
  const lh = Math.min(0.03, 0.9 / lines.length);
  const out: OcrWord[] = [];
  lines.forEach((line, i) => {
    const ws = line.split(/\s+/).filter(Boolean);
    const total = ws.reduce((a, w) => a + w.length + 1, 0);
    let x = 0.06;
    for (const w of ws) {
      const width = ((w.length + 1) / total) * 0.88;
      out.push([w, x, 0.05 + i * lh, x + width * 0.92, 0.05 + (i + 0.8) * lh]);
      x += width;
    }
  });
  return out;
}
