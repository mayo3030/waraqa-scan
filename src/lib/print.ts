// Printing: Android's print dialog in the app, the browser's elsewhere.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { saveFile } from "./save";

const Printer = registerPlugin<{ printPdf(o: { uri: string; name: string }): Promise<void> }>("Printer");

function toBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export async function printPdf(pdf: Blob, name: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: "print/" + name.replace(/[\\/:*?"<>|]+/g, "-") + ".pdf",
      data: await toBase64(pdf),
      directory: Directory.Cache,
      recursive: true,
    });
    await Printer.printPdf({ uri, name });
    return;
  }
  const url = URL.createObjectURL(pdf);
  const w = window.open(url, "_blank");
  if (!w) await saveFile(name + ".pdf", pdf);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
