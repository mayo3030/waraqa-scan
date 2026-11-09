// Adds one example document the first time the app opens, so the
// screens show what a scan looks like. It is labeled as a sample.
import { blobToRaster, rasterThumb, rasterToBlob } from "./io";
import { assetUrl } from "./cvload";
import { flatten, finish } from "./pipeline";
import { listDocs, newId, putDoc, savePage } from "./store";
import { NO_ADJUST } from "./filters";
import type { Quad } from "./geometry";

const KEY = "waraqa-sample-added";
// Page corners in the bundled sample photo (900 x 1200).
const SAMPLE_QUAD: Quad = [
  { x: 139, y: 151 }, { x: 773, y: 199 }, { x: 809, y: 1055 }, { x: 103, y: 1013 },
];

export async function seedSample(): Promise<boolean> {
  try { if (localStorage.getItem(KEY)) return false; } catch { /* storage blocked */ }
  if ((await listDocs()).length) return false;
  const res = await fetch(assetUrl("vendor/sample-page.jpg"));
  if (!res.ok) return false;
  const original = await res.blob();
  const src = await blobToRaster(original);
  const flat = flatten(src, SAMPLE_QUAD, 0);
  const out = finish(flat, "enhance", NO_ADJUST);
  const docId = newId(), pageId = newId();
  const now = Date.now();
  await putDoc({ id: docId, name: "Sample: bill of sale", createdAt: now, updatedAt: now, pageIds: [], sample: true });
  await savePage({
    id: pageId, docId, original, quad: SAMPLE_QUAD, rotation: 0, filter: "enhance", adjust: NO_ADJUST,
    result: await rasterToBlob(out), thumb: rasterThumb(out), width: out.width, height: out.height,
  });
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked */ }
  return true;
}
