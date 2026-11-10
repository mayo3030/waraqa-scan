// "Adjust after each scan" off: photos are saved straight away with the
// mode's filter, using the edges found automatically (or the whole photo).
import { detectAsync, finishAsync, flattenAsync } from "./engine";
import { fullQuad, type Quad } from "./geometry";
import { NO_ADJUST } from "./filters";
import { blobToRaster, rasterThumb, rasterToBlob } from "./io";
import { defaultName, newId, putDoc, savePage } from "./store";
import { modeInfo, type Mode } from "./modes";

export async function quickSave(
  blobs: Blob[],
  docId: string | undefined,
  mode: Mode | undefined,
  o: { hd: boolean; autoBorders: boolean },
  progress: (label: string) => void,
): Promise<{ docId: string; fresh: string[] }> {
  const filter = modeInfo(mode).filter;
  if (!docId) {
    docId = newId();
    const now = Date.now();
    await putDoc({ id: docId, name: defaultName(), createdAt: now, updatedAt: now, pageIds: [] });
  }
  const fresh: string[] = [];
  for (let i = 0; i < blobs.length; i++) {
    progress(blobs.length > 1 ? `Saving page ${i + 1} of ${blobs.length}` : "Saving the page");
    const src = await blobToRaster(blobs[i], o.hd ? 3600 : 2400);
    let quad: Quad = fullQuad(src.width, src.height, 0);
    if (o.autoBorders) {
      try { const d = await detectAsync(src); if (d.found) quad = d.quad; } catch { /* whole photo */ }
    }
    const flat = await flattenAsync(src, quad, 0, o.hd ? 3200 : 2000);
    const out = await finishAsync(flat, filter, NO_ADJUST);
    const id = newId();
    await savePage({
      id, docId, original: blobs[i], quad, rotation: 0, filter, adjust: NO_ADJUST,
      result: await rasterToBlob(out), thumb: rasterThumb(out), width: out.width, height: out.height,
    });
    fresh.push(id);
  }
  return { docId, fresh };
}
