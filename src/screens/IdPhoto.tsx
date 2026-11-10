import { useEffect, useMemo, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import type { Raster } from "../lib/geometry";
import { cropToRatio, PHOTO_SIZES } from "../lib/imaging";
import { rasterToCanvas, shrink } from "../lib/io";
import { runAsync } from "../lib/engine";
import { pageFromRaster } from "../lib/pagemake";
import { addPages, newDoc } from "../lib/store";

interface Props {
  photo: Raster;
  notify(t: Toast): void;
  onCancel(): void;
  onSaved(docId: string): void;
}

/** Pick a photo size and framing; saves one photo and a 4 x 6 print sheet. */
export function IdPhotoScreen({ photo, notify, onCancel, onSaved }: Props) {
  const [size, setSize] = useState(PHOTO_SIZES[0].id);
  const [zoom, setZoom] = useState(100); // percent of the largest crop
  const [y, setY] = useState(42); // where the crop centre sits, percent of height
  const [x, setX] = useState(50);
  const [saving, setSaving] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);
  const small = useMemo(() => shrink(photo, 900), [photo]);
  const ps = PHOTO_SIZES.find((s) => s.id === size)!;

  const framed = (src: Raster) => {
    // Zoom: crop the photo around the centre first, then fit the ratio.
    const z = zoom / 100;
    if (z >= 1) return cropToRatio(src, ps.w / ps.h, x / 100, y / 100);
    const w = Math.round(src.width * z), h = Math.round(src.height * z);
    const cx = Math.min(src.width - w, Math.max(0, (src.width * x) / 100 - w / 2));
    const cy = Math.min(src.height - h, Math.max(0, (src.height * y) / 100 - h / 2));
    const part = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let r = 0; r < h; r++) {
      const si = ((Math.round(cy) + r) * src.width + Math.round(cx)) * 4;
      part.data.set(src.data.subarray(si, si + w * 4), r * w * 4);
    }
    return cropToRatio(part, ps.w / ps.h, 0.5, 0.5);
  };

  useEffect(() => {
    if (view.current) rasterToCanvas(framed(small), view.current);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      // The job crops with its own centre, so hand it the framed photo.
      const r = await runAsync({ op: "idphoto", src: framed(photo), size });
      if (!r.rasters) throw new Error("no result");
      const doc = await newDoc(`ID photo ${ps.label}`, { tags: ["Photo"] });
      await addPages(doc.id, [await pageFromRaster(r.rasters[0], 0.95), await pageFromRaster(r.rasters[1], 0.95)]);
      onSaved(doc.id);
    } catch {
      notify({ text: "The photo could not be made", tone: "error" });
      setSaving(false);
    }
  };

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Back"><I.Back /></button>
        <h1 className="bar-title">ID photo</h1>
      </header>
      <div className="filter-stage">
        <canvas ref={view} className="sheet idphoto-view" />
      </div>
      <div className="filter-panel">
        <div className="chips" role="radiogroup" aria-label="Photo size">
          {PHOTO_SIZES.map((s) => (
            <button key={s.id} role="radio" aria-checked={s.id === size} className={"chip-btn" + (s.id === size ? " on" : "")} onClick={() => setSize(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="sliders">
          <label className="slider" htmlFor="idp-zoom">
            <span className="slider-head"><span>Zoom</span><span className="mono">{Math.round(10000 / zoom)}%</span></span>
            <input id="idp-zoom" type="range" min={40} max={100} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <label className="slider" htmlFor="idp-y">
            <span className="slider-head"><span>Up and down</span></span>
            <input id="idp-y" type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} />
          </label>
          <label className="slider" htmlFor="idp-x">
            <span className="slider-head"><span>Left and right</span></span>
            <input id="idp-x" type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted small">Saves one photo at {ps.label} and a 4 x 6 inch sheet of copies to print.</p>
      </div>
      <footer className="dock">
        <span className="dock-label">{ps.label}</span>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Making…" : "Save photo"}</button>
      </footer>
    </>
  );
}
