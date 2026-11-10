// Word, Excel, PowerPoint and image exports. Libraries load only when used.
import { blobToRaster, rasterToBlob } from "./io";
import { runAsync } from "./engine";
import { exportImage } from "./pdf";
import { cellValue, textToTable } from "./tableparse";
import type { PageRec } from "./store";

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Word file with the read text, one section per page, and optionally the page images. */
export async function toDocx(title: string, texts: string[], pages: PageRec[], withImages: boolean): Promise<Blob> {
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph>[] = [];
  children.push(new d.Paragraph({ text: title, heading: d.HeadingLevel.HEADING_1 }));
  for (let i = 0; i < Math.max(texts.length, pages.length); i++) {
    if (i > 0) children.push(new d.Paragraph({ children: [new d.PageBreak()] }));
    if (withImages && pages[i]) {
      const img = await exportImage(pages[i], { maxSide: 1400, quality: 0.82 });
      const bytes = Uint8Array.from(atob(img.data.split(",")[1]), (c) => c.charCodeAt(0));
      const w = 600, h = Math.round((img.height * w) / img.width);
      children.push(new d.Paragraph({
        children: [new d.ImageRun({ type: "jpg", data: bytes, transformation: { width: w, height: h } })],
      }));
    }
    for (const line of (texts[i] ?? "").split(/\r?\n/)) {
      const rtl = isArabic(line);
      children.push(new d.Paragraph({
        bidirectional: rtl,
        alignment: rtl ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
        children: [new d.TextRun({ text: line, rightToLeft: rtl })],
      }));
    }
  }
  const doc = new d.Document({
    creator: "Waraqa Scan",
    title,
    sections: [{ children }],
  });
  return d.Packer.toBlob(doc);
}

/** Word file with the formula pictures and their LaTeX, ready to convert to Word equations. */
export async function toLatexDocx(title: string, latex: string, pages: PageRec[]): Promise<Blob> {
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph>[] = [];
  children.push(new d.Paragraph({ text: title, heading: d.HeadingLevel.HEADING_1 }));
  children.push(new d.Paragraph({
    children: [new d.TextRun({ text: "To make a line a Word equation: select it, press Alt and = together, pick LaTeX, then Convert.", italics: true, color: "5D6185" })],
  }));
  for (const p of pages) {
    const img = await exportImage(p, { maxSide: 1400, quality: 0.85 });
    const bytes = Uint8Array.from(atob(img.data.split(",")[1]), (c) => c.charCodeAt(0));
    const w = 560, h = Math.round((img.height * w) / img.width);
    children.push(new d.Paragraph({ children: [new d.ImageRun({ type: "jpg", data: bytes, transformation: { width: w, height: h } })] }));
  }
  for (const line of latex.split(/\n/)) {
    if (!line.trim()) continue;
    children.push(new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: line.trim(), font: "Cambria Math" })] }));
  }
  const doc = new d.Document({ creator: "Waraqa Scan", title, sections: [{ children }] });
  return d.Packer.toBlob(doc);
}

/** Review sheet for Incorrect Question: each question with space for the right answer. */
export async function toReviewDocx(title: string, questions: string[]): Promise<Blob> {
  const d = await import("docx");
  const children: InstanceType<typeof d.Paragraph>[] = [];
  children.push(new d.Paragraph({ text: title, heading: d.HeadingLevel.HEADING_1 }));
  children.push(new d.Paragraph({ children: [new d.TextRun({ text: `${questions.length} ${questions.length === 1 ? "question" : "questions"} to review`, italics: true })] }));
  const para = (text: string, opts: { bold?: boolean; color?: string } = {}) => {
    const rtl = isArabic(text);
    return new d.Paragraph({
      bidirectional: rtl,
      alignment: rtl ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [new d.TextRun({ text, rightToLeft: rtl, bold: opts.bold, color: opts.color })],
    });
  };
  questions.forEach((q, i) => {
    children.push(new d.Paragraph({ text: `Question ${i + 1}`, heading: d.HeadingLevel.HEADING_2 }));
    for (const line of q.split(/\n/)) children.push(para(line));
    for (const label of ["My answer:", "Correct answer:", "Why I got it wrong:"]) {
      children.push(para(label, { bold: true, color: "3A3F8F" }));
      children.push(para("______________________________________________"));
    }
  });
  const doc = new d.Document({ creator: "Waraqa Scan", title, sections: [{ children }] });
  return d.Packer.toBlob(doc);
}

/** Excel file: one sheet per page, rows and columns guessed from the text. */
export async function toXlsx(texts: string[]): Promise<Blob> {
  const X = await import("xlsx");
  const wb = X.utils.book_new();
  texts.forEach((t, i) => {
    const rows = textToTable(t).map((r) => r.map(cellValue));
    const ws = X.utils.aoa_to_sheet(rows.length ? rows : [[""]]);
    const widths: number[] = [];
    rows.forEach((r) => r.forEach((c, k) => { widths[k] = Math.min(60, Math.max(widths[k] ?? 8, String(c).length + 2)); }));
    ws["!cols"] = widths.map((wch) => ({ wch }));
    X.utils.book_append_sheet(wb, ws, `Page ${i + 1}`);
  });
  const out = X.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** PowerPoint file: one slide per page, the page image fitted on the slide. */
export async function toPptx(title: string, pages: PageRec[], texts: string[] = []): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  const landscape = pages.filter((p) => p.width > p.height).length >= pages.length / 2;
  pptx.layout = landscape ? "LAYOUT_16x9" : "LAYOUT_4x3";
  pptx.title = title;
  const [SW, SH] = landscape ? [10, 5.625] : [10, 7.5];
  for (let i = 0; i < pages.length; i++) {
    const img = await exportImage(pages[i], { maxSide: 1800, quality: 0.85 });
    const s = Math.min(SW / img.width, SH / img.height);
    const w = img.width * s, h = img.height * s;
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addImage({ data: img.data, x: (SW - w) / 2, y: (SH - h) / 2, w, h });
    if (texts[i]) slide.addNotes(texts[i]);
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/** One tall JPEG with every page under the previous one. */
export async function toLongImage(pages: PageRec[]): Promise<Blob> {
  const rasters = [];
  for (const p of pages) rasters.push(await blobToRaster(p.result, 1600));
  const [first, ...more] = rasters;
  const r = await runAsync({ op: "stack", src: first, more }, 90000);
  return rasterToBlob(r.raster!, 0.85);
}
