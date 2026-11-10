// Remove glare on the phone: photos come in pairs (front, front, back, back). Each pair is
// found, flattened to one size and joined in the background into one clean card photo.
import { blobToRaster, rasterToBlob } from "./io";
import { detectAsync, flattenAsync, runAsync } from "./engine";
import { fullQuad, outputSize, type Quad, type Raster } from "./geometry";

export async function joinPairs(blobs: Blob[], hd: boolean, progress: (label: string) => void): Promise<Blob[]> {
  const out: Blob[] = [];
  const sides = Math.ceil(blobs.length / 2);
  const maxSide = hd ? 3200 : 2000;
  for (let i = 0; i < blobs.length; i += 2) {
    progress(sides > 1 ? `Removing the flash glare, side ${i / 2 + 1} of ${sides}` : "Removing the flash glare");
    const rasters: Raster[] = [], quads: Quad[] = [], found: boolean[] = [];
    for (const b of blobs.slice(i, i + 2)) {
      const r = await blobToRaster(b, hd ? 3600 : 2400);
      let q = fullQuad(r.width, r.height, 0), ok = false;
      try { const d = await detectAsync(r); if (d.found) { q = d.quad; ok = true; } } catch { /* whole photo */ }
      rasters.push(r); quads.push(q); found.push(ok);
    }
    let flat: Raster;
    const wide = (q: Quad) => { const s = outputSize(q, 1000); return s.w >= s.h; };
    // Join only two cards that were both found and held the same way round; else keep one.
    if (rasters.length === 2 && found[0] && found[1] && wide(quads[0]) === wide(quads[1])) {
      const r = await runAsync({ op: "deglare", src: rasters[0], more: [rasters[1]], quads, maxSide }, 90000);
      if (!r.raster) throw new Error("No image");
      flat = r.raster;
    } else {
      const k = found[0] || !found[1] ? 0 : 1;
      flat = await flattenAsync(rasters[k], quads[k], 0, maxSide);
    }
    out.push(await rasterToBlob(flat, 0.95));
  }
  return out;
}
