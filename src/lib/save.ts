// Hands a file to the person: the Claude page viewer's save prompt when
// running as an artifact, a normal browser download otherwise.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
type Saver = { save(r: { filename: string; data: Blob }): Promise<unknown> };

let saverP: Promise<Saver | null> | null = null;
function saver(): Promise<Saver | null> {
  const c = (window as any).claude;
  if (!c?.use) return Promise.resolve(null);
  saverP ??= c.use("downloads").catch(() => null);
  return saverP!;
}

export type SaveOutcome = "saved" | "declined" | "unavailable";

const isNative = () => Capacitor.isNativePlatform();

function toBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

// Android app: write the file to the app's cache and open the share sheet,
// where the person picks Files, Drive, WhatsApp, email and so on.
export async function shareNative(filename: string, data: Blob, title?: string): Promise<SaveOutcome> {
  try {
    const { uri } = await Filesystem.writeFile({
      path: "exports/" + filename,
      data: await toBase64(data),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({ title: title ?? filename, files: [uri], dialogTitle: "Save or send" });
    return "saved";
  } catch (e: any) {
    const m = String(e?.message ?? e).toLowerCase();
    return m.includes("cancel") ? "declined" : "unavailable";
  }
}

export async function saveFile(filename: string, data: Blob): Promise<SaveOutcome> {
  if (isNative()) return shareNative(filename, data);
  const s = await saver();
  if (s) {
    try {
      await s.save({ filename, data });
      return "saved";
    } catch (e: any) {
      if (e?.code === "declined") return "declined";
      return "unavailable";
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "saved";
}

export function canShareFiles(f: File) {
  if (isNative()) return true;
  return !!(navigator as any).canShare?.({ files: [f] });
}

export function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "scan";
}
