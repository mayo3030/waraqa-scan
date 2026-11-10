// Camera modes: what each one asks for and what happens to the pages after saving.
import type { FilterKind } from "./filters";
import { blobToRaster } from "./io";
import { runAsync } from "./engine";
import { pageFromRaster } from "./pagemake";
import { addPages, deletePage, getDoc, getPages, putDoc, type DocRec } from "./store";
import { stampImage, watermarkImage } from "./stamp";
import { CARD_MM } from "./imaging";
import { pageFromImage } from "./pagemake";
import { aiPhoto } from "./ai";
import { decodeImageElement } from "./canvasimg";
import { finishCanvas } from "./stamp";
import { replaceResult } from "./store";
import { rasterThumb, rasterToBlob } from "./io";

export type Mode =
  | "scan" | "ocr" | "word" | "excel" | "idcard" | "receipt" | "book" | "whiteboard"
  | "slides" | "mega" | "idphoto" | "timestamp" | "code"
  | "formula" | "translate" | "question" | "restore" | "erase" | "count" | "greeting";

export type IdPreset = "general" | "license" | "idcard" | "passport" | "bank";
export const ID_PRESETS: { id: IdPreset; label: string; sides: 1 | 2; card: [number, number] }[] = [
  { id: "general", label: "General", sides: 2, card: CARD_MM.card },
  { id: "license", label: "Driver License", sides: 2, card: CARD_MM.card },
  { id: "idcard", label: "ID Card", sides: 2, card: CARD_MM.card },
  { id: "passport", label: "Passport", sides: 1, card: CARD_MM.passport },
  { id: "bank", label: "Bank Card", sides: 2, card: CARD_MM.card },
];
export const idPreset = (id?: IdPreset) => ID_PRESETS.find((p) => p.id === id) ?? ID_PRESETS[0];

/** Choices made on the camera that the steps after saving need. */
export interface ModeOpts {
  id?: IdPreset;
  watermark?: string; // "For ___ use only" text for ID sheets
  restore?: "restore" | "colorize";
  ai?: boolean; // Restore Photo: use the online AI models (Replicate)
  paper?: "a4" | "letter"; // ID sheet paper
  deglare?: boolean; // ID cards: two photos of each side, joined without the flash glare
}

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
  { id: "scan", label: "Scan", shots: "many", filter: "auto", help: "Hold the phone over the page. Waraqa finds the edges, then you can fix the corners." },
  { id: "ocr", label: "Extract Text", shots: "many", filter: "enhance", help: "Scan the page, then Waraqa reads the text on it. Works offline after the first use." },
  { id: "word", label: "To Word", shots: "many", filter: "enhance", help: "Scan the pages, Waraqa reads the text and saves a Word file you can edit." },
  { id: "excel", label: "To Excel", shots: "many", filter: "enhance", help: "Scan a table. Waraqa reads it and guesses rows and columns for an Excel file. Check the result, simple tables work best." },
  { id: "idcard", label: "ID Cards", shots: "two", filter: "photo", tag: "ID Card", help: "Take the front, then the back. Both sides go on one page at real card size, ready to print." },
  { id: "receipt", label: "Receipt", shots: "many", filter: "gray", tag: "Receipt", help: "Lay the receipt flat. Long receipts can be taken in parts with Mega Scan." },
  { id: "book", label: "Book", shots: "many", filter: "auto", tag: "Book", help: "Photograph two open pages. Waraqa splits them at the spine into two pages." },
  { id: "whiteboard", label: "Whiteboard", shots: "many", filter: "original", tag: "Whiteboard", help: "Take the board from the front. Glare and shadows are cleaned and the background turns white." },
  { id: "slides", label: "Slides", shots: "many", filter: "photo", tag: "Slides", help: "Photograph a screen or projected slide. Keep colors, fix the angle." },
  { id: "mega", label: "Mega Scan", shots: "many", filter: "auto", help: "For long pages: take the page top to bottom in parts, with some overlap between shots. They are joined into one page." },
  { id: "idphoto", label: "ID Photo", shots: "one", filter: "original", tag: "Photo", help: "Take a photo of the face against a plain light wall. Then pick a size, Waraqa makes one photo and a 4 x 6 print sheet." },
  { id: "timestamp", label: "Timestamp", shots: "many", filter: "original", help: "Each photo gets the date and time written on it. Turn on location in the menu to add the place." },
  { id: "code", label: "Scan Code", shots: "one", filter: "original", help: "Point at a QR code or barcode. The result shows as soon as it is read, and the last ones are kept in History." },
  { id: "formula", label: "Formula", shots: "one", filter: "enhance", tag: "Formula", help: "Photograph the page, then drag the corners to just the formulas. Waraqa saves them in a Word file as a picture with the text it could read. Turning formulas into editable equations needs an online service, so it is not done here." },
  { id: "translate", label: "Translate", shots: "many", filter: "enhance", help: "Scan the page and pick the language at the top. Waraqa reads the text on the phone, then translates it on the phone where Android offers that, or opens Google Translate with the text when you tap it." },
  { id: "question", label: "Incorrect Question", shots: "many", filter: "enhance", tag: "Questions", help: "Scan a test or worksheet. Waraqa reads it and splits it into numbered questions. Tick the ones you got wrong and save a review sheet in Word with space for the right answer." },
  { id: "restore", label: "Restore Photo", shots: "one", filter: "original", tag: "Photo", help: "Photograph an old print flat, without glare. Restore removes dust and fading. Colorize adds warm tones to a black and white photo. Real AI repair and colorizing need an online service, so this is the on-phone version." },
  { id: "erase", label: "Smart Erase", shots: "one", filter: "enhance", help: "Scan the page, then paint over what you want gone. Waraqa fills it in from the area around it." },
  { id: "count", label: "CountCam", shots: "one", filter: "original", tag: "Count", help: "Photograph things from above on a plain background, like pipes, coins or boxes. Waraqa marks and counts them. Tap to add one it missed, tap a mark to remove it." },
  { id: "greeting", label: "Greeting Card", shots: "one", filter: "original", tag: "Card", help: "Take or import a photo, pick a design and write your message. The card is saved as a page you can share or print." },
];

/** Modes whose photo goes to its own screen instead of corners and filters. */
export const OWN_SCREEN: Mode[] = ["idphoto", "count", "greeting"];

export const modeInfo = (m: Mode = "scan") => MODES.find((x) => x.id === m) ?? MODES[0];

/** Where the app goes after a mode finished saving. */
export type After = { open: string; tool?: "text" | "word" | "excel" | "translate" | "questions" | "latex"; erase?: string; note?: string };

/**
 * Runs after the last photo of a session is saved. `fresh` lists the page ids
 * saved in this session, in order.
 */
export async function postProcess(
  mode: Mode,
  docId: string,
  fresh: string[],
  extra: { stamps?: string[][]; paper?: "letter" | "a4"; opts?: ModeOpts },
  progress: (label: string) => void,
): Promise<After> {
  const doc = await getDoc(docId);
  if (!doc) return { open: docId };
  const info = modeInfo(mode);
  const all = await getPages(doc);
  const mine = all.filter((p) => fresh.includes(p.id));
  await tag(doc, info.tag);
  let note: string | undefined;

  switch (mode) {
    case "ocr": return { open: docId, tool: "text" };
    case "word": return { open: docId, tool: "word" };
    case "excel": return { open: docId, tool: "excel" };
    case "formula": return { open: docId, tool: "latex" };
    case "translate": return { open: docId, tool: "translate" };
    case "question": return { open: docId, tool: "questions" };
    case "erase": return { open: docId, erase: mine[0]?.id };
    case "idcard": {
      if (!mine.length) break;
      const preset = idPreset(extra.opts?.id);
      progress(mine.length > 1 ? "Putting both sides on one page" : "Placing it on the page");
      const sides = [];
      for (const p of mine) sides.push(await blobToRaster(p.result, 1600));
      const [first, ...more] = sides;
      const r = await runAsync({ op: "idcard", src: first, more, paper: extra.opts?.paper ?? "a4", card: preset.card });
      if (r.raster) {
        const wm = extra.opts?.watermark?.trim();
        const page = wm ? pageFromImage(await watermarkImage(await rasterToBlob(r.raster, 0.92), wm)) : await pageFromRaster(r.raster);
        await addPages(docId, [page]);
        for (const p of mine) await deletePage(docId, p.id);
        if (preset.id !== "general") await tag((await getDoc(docId))!, preset.label);
      }
      break;
    }
    case "restore": {
      const colorize = extra.opts?.restore === "colorize";
      if (extra.opts?.ai) {
        try {
          for (const p of mine) {
            const out = await aiPhoto(colorize ? "colorize" : "restore", p.result, progress);
            const img = await finishCanvas(await canvasOf(out), 0.92);
            await replaceResult(p, img.blob, img.thumb, img.width, img.height);
          }
          break;
        } catch (e) {
          note = (e instanceof Error ? e.message : "The AI model did not finish.") + " Used the on-phone version instead.";
        }
      }
      progress(colorize ? "Adding color" : "Restoring the photo");
      for (const p of mine) {
        const r = await runAsync({ op: "tool", tool: colorize ? "colorize" : "restore", src: await blobToRaster(p.result, 2400) }, 90000);
        if (r.raster) await replaceResult(p, await rasterToBlob(r.raster, 0.92), rasterThumb(r.raster), r.raster.width, r.raster.height);
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
  return { open: docId, note };
}

async function canvasOf(b: Blob): Promise<HTMLCanvasElement> {
  const el = await decodeImageElement(b);
  const c = document.createElement("canvas");
  c.width = el.naturalWidth; c.height = el.naturalHeight;
  c.getContext("2d")!.drawImage(el, 0, 0);
  return c;
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
