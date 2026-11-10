// Reads QR codes: the phone's own detector when there is one, jsQR otherwise.
import jsQR from "jsqr";
import { decodeImageElement } from "./canvasimg";

/* eslint-disable @typescript-eslint/no-explicit-any */
let detector: any | null | undefined;
async function native(): Promise<any | null> {
  if (detector !== undefined) return detector;
  const BD = (globalThis as any).BarcodeDetector;
  try {
    if (BD) {
      const formats: string[] = await BD.getSupportedFormats();
      detector = formats.includes("qr_code") ? new BD({ formats }) : null;
    } else detector = null;
  } catch {
    detector = null;
  }
  return detector;
}

const work = document.createElement("canvas");

function withJsQr(src: CanvasImageSource, w: number, h: number): string | null {
  const s = Math.min(1, 800 / Math.max(w, h));
  work.width = Math.round(w * s); work.height = Math.round(h * s);
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, work.width, work.height);
  const d = ctx.getImageData(0, 0, work.width, work.height);
  return jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

/** One read of the current video frame. */
export async function readCode(v: HTMLVideoElement): Promise<string | null> {
  const d = await native();
  if (d) {
    const found = await d.detect(v);
    if (found[0]?.rawValue) return found[0].rawValue as string;
    return null;
  }
  return withJsQr(v, v.videoWidth, v.videoHeight);
}

export async function readCodeFromImage(b: Blob): Promise<string | null> {
  const img = await decodeImageElement(b);
  const d = await native();
  if (d) {
    const found = await d.detect(img).catch(() => []);
    if (found[0]?.rawValue) return found[0].rawValue as string;
  }
  return withJsQr(img, img.naturalWidth, img.naturalHeight);
}

/** Only plain web links get an Open button. */
export function asLink(text: string): string | null {
  try {
    const u = new URL(text.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
