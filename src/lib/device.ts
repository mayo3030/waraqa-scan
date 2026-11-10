// Native extras: orientation lock and saving photos to the gallery.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export type Orientation = "auto" | "portrait" | "landscape";

const Device = registerPlugin<{
  setOrientation(o: { mode: Orientation }): Promise<void>;
  saveToGallery(o: { uri: string; name: string }): Promise<{ uri: string }>;
}>("Device");

export async function lockOrientation(mode: Orientation): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) { await Device.setOrientation({ mode }); return; }
    const so = screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void>; unlock?(): void };
    if (mode === "auto") so.unlock?.();
    else await so.lock?.(mode);
  } catch { /* not supported here */ }
}

function toBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Saves a camera photo to Pictures/Waraqa. Returns false where that is not possible. */
export async function saveToGallery(photo: Blob): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const name = `Waraqa_${stamp}_${Math.random().toString(36).slice(2, 6)}.jpg`;
  try {
    const { uri } = await Filesystem.writeFile({ path: "gallery/" + name, data: await toBase64(photo), directory: Directory.Cache, recursive: true });
    await Device.saveToGallery({ uri, name });
    return true;
  } catch {
    return false;
  }
}

/** A short shutter click made with WebAudio (no sound file needed). */
let ctx: AudioContext | null = null;
export function shutterClick() {
  try {
    ctx ??= new AudioContext();
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < len / 2 ? 1 : 0.5);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.buffer = buf;
    src.connect(g).connect(ctx.destination);
    src.start();
  } catch { /* no audio */ }
}
