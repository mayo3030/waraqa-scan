// Burns text (time, place) or a signature into a page image with a canvas.
import { decodeImageElement } from "./canvasimg";

export function stampLines(at: Date, coords?: { lat: number; lon: number } | null): string[] {
  const day = at.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", weekday: "short" });
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const lines = [`${day}  ${time}`];
  if (coords) lines.push(`${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`);
  return lines;
}

/** Writes the lines in the bottom right corner on a dark band. */
export async function stampImage(img: Blob, lines: string[]): Promise<{ blob: Blob; thumb: string; width: number; height: number }> {
  const el = await decodeImageElement(img);
  const c = document.createElement("canvas");
  c.width = el.naturalWidth; c.height = el.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(el, 0, 0);
  const size = Math.max(16, Math.round(Math.min(c.width, c.height) / 26));
  ctx.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const pad = Math.round(size * 0.6);
  const lineH = Math.round(size * 1.3);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const h = lines.length * lineH + pad * 1.2;
  const x = c.width - w - pad, y = c.height - h - pad;
  ctx.fillStyle = "rgba(15, 16, 36, 0.62)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#f2b33d";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad * 0.6 + i * lineH));
  return finishCanvas(c);
}

export async function finishCanvas(c: HTMLCanvasElement, quality = 0.9) {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", quality));
  const s = Math.min(1, 360 / Math.max(c.width, c.height));
  const t = document.createElement("canvas");
  t.width = Math.round(c.width * s); t.height = Math.round(c.height * s);
  const tctx = t.getContext("2d")!;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(c, 0, 0, t.width, t.height);
  return { blob, thumb: t.toDataURL("image/jpeg", 0.8), width: c.width, height: c.height };
}

/** The current position, or null when it is refused or slow. */
export function currentPlace(): Promise<{ lat: number; lon: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => res(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  });
}
