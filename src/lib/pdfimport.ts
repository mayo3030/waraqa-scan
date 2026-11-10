// Opens a PDF file and draws each page as an image (Import Files, PDF to images).
import { assetUrl } from "./cvload";
import type { Raster } from "./geometry";

/** Renders every page at about `dpi`, longest side capped at `maxSide`. */
export async function pdfToRasters(
  file: Blob,
  progress: (done: number, total: number) => void = () => {},
  dpi = 150,
  maxSide = 2200,
): Promise<Raster[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = assetUrl("vendor/pdf.worker.min.js");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const out: Raster[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      progress(n - 1, pdf.numPages);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(dpi / 72, maxSide / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const id = ctx.getImageData(0, 0, c.width, c.height);
      out.push({ width: c.width, height: c.height, data: id.data });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  progress(out.length, out.length);
  return out;
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
