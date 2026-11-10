// Builds a PDF from page images with jsPDF.
import { jsPDF } from "jspdf";
import { blobToDataUrl } from "./io";
import type { PageRec } from "./store";
import { addTextLayer, wordsFromText, type FontLoader } from "./pdftext";
import { assetUrl } from "./cvload";

let fontB64: Promise<string | null> | null = null;
const loadFont: FontLoader = () =>
  (fontB64 ??= fetch(assetUrl("vendor/fonts/plex-arabic.ttf"))
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("font"))))
    .then(blobToDataUrl)
    .then((u) => u.split(",")[1] ?? null)
    .catch(() => { fontB64 = null; return null; }));

export type PaperSize = "letter" | "a4" | "fit";

export const PAPER: { id: PaperSize; label: string }[] = [
  { id: "letter", label: "Letter" },
  { id: "a4", label: "A4" },
  { id: "fit", label: "Same as page" },
];

const SIZES = { letter: [215.9, 279.4], a4: [210, 297] } as const;

export interface PdfOptions {
  /** Smaller file: pages at about 110 dpi and stronger JPEG compression. */
  compress?: boolean;
  /** Text drawn diagonally across every page. */
  watermark?: string;
  /** Asks for this password before the PDF opens. */
  password?: string;
  /** Read text, one string per page, for pages whose word positions are not known. */
  text?: string[];
}

/** Page image ready for export: optional downscale and watermark, as JPEG data URL. */
export async function exportImage(
  p: { result: Blob; width: number; height: number },
  o: { maxSide?: number; quality?: number; watermark?: string } = {},
): Promise<{ data: string; width: number; height: number }> {
  if (!o.maxSide && !o.watermark && !o.quality) return { data: await blobToDataUrl(p.result), width: p.width, height: p.height };
  const url = URL.createObjectURL(p.result);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("A page image could not be opened"));
      el.src = url;
    });
    const s = o.maxSide ? Math.min(1, o.maxSide / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (o.watermark) drawWatermark(ctx, c.width, c.height, o.watermark);
    return { data: c.toDataURL("image/jpeg", o.quality ?? 0.88), width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const size = Math.max(18, Math.round(Math.min(w, h) / 11));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.atan2(h, w));
  ctx.font = `600 ${size}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(60, 64, 110, 0.18)";
  const step = size * 3.2;
  const diag = Math.hypot(w, h);
  for (let y = -diag / 2; y <= diag / 2; y += step) ctx.fillText(text, 0, y, diag * 0.9);
  ctx.restore();
}

export async function buildPdf(pages: PageRec[], paper: PaperSize, title: string, opts: PdfOptions = {}): Promise<Blob> {
  let pdf: jsPDF | null = null;
  for (const [i, p] of pages.entries()) {
    const img = await exportImage(p, {
      maxSide: opts.compress ? 1240 : undefined,
      quality: opts.compress ? 0.6 : undefined,
      watermark: opts.watermark?.trim() || undefined,
    });
    const landscape = p.width > p.height;
    let pw: number, ph: number;
    if (paper === "fit") {
      // 150 dpi equivalent page size in mm
      pw = (p.width / 150) * 25.4; ph = (p.height / 150) * 25.4;
    } else {
      const [a, b] = SIZES[paper];
      [pw, ph] = landscape ? [b, a] : [a, b];
    }
    const orient = pw > ph ? "landscape" : "portrait";
    if (!pdf) {
      pdf = new jsPDF({
        unit: "mm", format: [pw, ph], orientation: orient, compress: true,
        ...(opts.password
          ? { encryption: { userPassword: opts.password, ownerPassword: opts.password, userPermissions: ["print", "copy"] } }
          : {}),
      });
    } else pdf.addPage([pw, ph], orient);
    const s = Math.min(pw / img.width, ph / img.height);
    const w = img.width * s, h = img.height * s;
    pdf.addImage(img.data, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
    // Searchable: the read words go on top, unseen.
    const words = p.words?.length ? p.words : wordsFromText(opts.text?.[i] ?? "");
    if (words.length) await addTextLayer(pdf, words, { x: (pw - w) / 2, y: (ph - h) / 2, w, h }, loadFont);
  }
  if (!pdf) throw new Error("This document has no pages yet");
  pdf.setProperties({ title, creator: "Waraqa Scan" });
  return pdf.output("blob");
}
