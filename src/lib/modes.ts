// Camera modes: what each one asks for and what happens to the pages after saving.
import type { FilterKind } from "./filters";
import { blobToRaster } from "./io";
import { runAsync } from "./engine";
import { pageFromRaster } from "./pagemake";
import { addPages, deletePage, getDoc, getPages, putDoc, type DocRec } from "./store";
import { stampImage } from "./stamp";
import { replaceResult } from "./store";
import { rasterThumb, rasterToBlob } from "./io";

export type Mode =
  | "scan" | "ocr" | "word" | "excel" | "idcard" | "receipt" | "book" | "whiteboard"
  | "slides" | "mega" | "idphoto" | "timestamp" | "code";

export interface ModeInfo {
  id: Mode;
  label: string;
  /** one: a single photo; two: front and back; many: any number. */
  shots: "one" | "two" | "many";
  filter: FilterKind;
  tag?: string;
  help: string;
}

export const MODES: ModeInfo[] = [
  { id: "scan", label: "Scan", shots: "many", filter: "enhance", help: "Hold the phone over the page. Waraqa finds the edges, then you can fix the corners." },
  { id: "ocr", label: "Extract Text", shots: "many", filter: "enhance", help: "Scan the page, then Waraqa reads the text on it. Works offline after the first use." },
  { id: "word", label: "To Word", shots: "many", filter: "enhance", help: "Scan the pages, Waraqa reads the text and saves a Word file you can edit." },
  { id: "excel", label: "To Excel", shots: "many", filter: "enhance", help: "Scan a table. Waraqa reads it and guesses rows and columns for an Excel file. Check the result, simple tables work best." },
  { id: "idcard", label: "ID Cards", shots: "two", filter: "original", tag: "ID Card", help: "Take the front, then the back. Both sides go on one page at real card size, ready to print." },
  { id: "receipt", label: "Receipt", shots: "many", filter: "gray", tag: "Receipt", help: "Lay the receipt flat. Long receipts can be taken in parts with Mega Scan." },
  { id: "book", label: "Book", shots: "many", filter: "enhance", tag: "Book", help: "Photograph two open pages. Waraqa splits them at the spine into two pages." },
  { id: "whiteboard", label: "Whiteboard", shots: "many", filter: "original", tag: "Whiteboard", help: "Take the board from the front. Glare and shadows are cleaned and the background turns white." },
  { id: "slides", label: "Slides", shots: "many", filter: "original", tag: "Slides", help: "Photograph a screen or projected slide. Keep colors, fix the angle." },
  { id: "mega", label: "Mega Scan", shots: "many", filter: "enhance", help: "For long pages: take the page top to bottom in parts, with some overlap between shots. They are joined into one page." },
  { id: "idphoto", label: "ID Photo", shots: "one", filter: "original", tag: "Photo", help: "Take a photo of the face against a plain light wall. Then pick a size, Waraqa makes one photo and a 4 x 6 print sheet." },
  { id: "timestamp", label: "Timestamp", shots: "many", filter: "original", help: "Each photo gets the date and time written on it. Turn on location in the menu to add the place." },
  { id: "code", label: "Scan Code", shots: "one", filter: "original", help: "Point at a QR code. The result shows as soon as it is read." },
];

export const modeInfo = (m: Mode = "scan") => MODES.find((x) => x.id === m) ?? MODES[0];

/** Where the app goes after a mode finished saving. */
export type After = { open: string; tool?: "text" | "word" | "excel" };

/**
 * Runs after the last photo of a session is saved. `fresh` lists the page ids
 * saved in this session, in order.
 */
export async function postProcess(
  mode: Mode,
  docId: string,
  fresh: string[],
  extra: { stamps?: string[][]; paper?: "letter" | "a4" },
  progress: (label: string) => void,
): Promise<After> {
  const doc = await getDoc(docId);
  if (!doc) return { open: docId };
  const info = modeInfo(mode);
  const all = await getPages(doc);
  const mine = all.filter((p) => fresh.includes(p.id));
  await tag(doc, info.tag);

  switch (mode) {
    case "ocr": return { open: docId, tool: "text" };
    case "word": return { open: docId, tool: "word" };
    case "excel": return { open: docId, tool: "excel" };
    case "idcard": {
      if (!mine.length) break;
      progress("Putting both sides on one page");
      const sides = [];
      for (const p of mine) sides.push(await blobToRaster(p.result, 1400));
      const [first, ...more] = sides;
      const r = await runAsync({ op: "idcard", src: first, more, paper: extra.paper ?? "letter" });
      if (r.raster) {
        await addPages(docId, [await pageFromRaster(r.raster)]);
        for (const p of mine) await deletePage(docId, p.id);
      }
      break;
    }
    case "book": {
      progress("Splitting the pages at the spine");
      for (const p of mine) {
        const r = await runAsync({ op: "split", src: await blobToRaster(p.result, 3000) });
        if (!r.rasters) continue;
        const made = [];
        for (const half of r.rasters) made.push(await pageFromRaster(half));
        await insertAfter(docId, p.id, made);
        await deletePage(docId, p.id);
      }
      break;
    }
    case "whiteboard": {
      progress("Cleaning the board");
      for (const p of mine) {
        const r = await runAsync({ op: "tool", tool: "whiteboard", src: await blobToRaster(p.result, 2400) });
        if (r.raster) await replaceResult(p, await rasterToBlob(r.raster), rasterThumb(r.raster), r.raster.width, r.raster.height);
      }
      break;
    }
    case "timestamp": {
      progress("Adding the time");
      for (let i = 0; i < mine.length; i++) {
        const lines = extra.stamps?.[i] ?? extra.stamps?.[extra.stamps.length - 1];
        if (!lines) continue;
        const s = await stampImage(mine[i].result, lines);
        await replaceResult(mine[i], s.blob, s.thumb, s.width, s.height);
      }
      break;
    }
  }
  return { open: docId };
}

async function tag(doc: DocRec, t?: string) {
  if (!t || doc.tags?.includes(t)) return;
  await putDoc({ ...doc, tags: [...(doc.tags ?? []), t], updatedAt: Date.now() });
}

/** Adds new pages right after `pageId` (addPages puts them at the end first). */
async function insertAfter(docId: string, pageId: string, made: Awaited<ReturnType<typeof pageFromRaster>>[]) {
  const before = (await getDoc(docId))!.pageIds.length;
  await addPages(docId, made);
  const d = (await getDoc(docId))!;
  const added = d.pageIds.slice(before);
  const rest = d.pageIds.slice(0, before);
  const at = rest.indexOf(pageId);
  rest.splice(at + 1, 0, ...added);
  await putDoc({ ...d, pageIds: rest, updatedAt: Date.now() });
}
