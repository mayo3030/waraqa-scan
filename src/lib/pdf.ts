// Builds a PDF from page images with jsPDF.
import { jsPDF } from "jspdf";
import { blobToDataUrl } from "./io";
import type { PageRec } from "./store";

export type PaperSize = "letter" | "a4" | "fit";

export const PAPER: { id: PaperSize; label: string }[] = [
  { id: "letter", label: "Letter" },
  { id: "a4", label: "A4" },
  { id: "fit", label: "Same as page" },
];

const SIZES = { letter: [215.9, 279.4], a4: [210, 297] } as const;

export async function buildPdf(pages: PageRec[], paper: PaperSize, title: string): Promise<Blob> {
  let pdf: jsPDF | null = null;
  for (const p of pages) {
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
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: [pw, ph], orientation: orient, compress: true });
    else pdf.addPage([pw, ph], orient);
    const s = Math.min(pw / p.width, ph / p.height);
    const w = p.width * s, h = p.height * s;
    const data = await blobToDataUrl(p.result);
    pdf.addImage(data, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
  }
  if (!pdf) throw new Error("This document has no pages yet");
  pdf.setProperties({ title, creator: "Waraqa Scan" });
  return pdf.output("blob");
}
