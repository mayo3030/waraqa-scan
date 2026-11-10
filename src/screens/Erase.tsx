import { useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import type { Raster } from "../lib/geometry";
import { blobToRaster, rasterThumb, rasterToBlob, rasterToCanvas } from "../lib/io";
import { runAsync } from "../lib/engine";
import { replaceResult, type PageRec } from "../lib/store";

interface Props {
  page: PageRec;
  label: string;
  notify(t: Toast): void;
  onDone(changed: boolean): void;
}

/**
 * Smart erase: paint over a stain, a pen mark or a finger, and the area is
 * filled from its surroundings. Works best on plain paper backgrounds.
 */
export function EraseScreen({ page, label, notify, onDone }: Props) {
  const [img, setImg] = useState<Raster | null>(null);
  const [brush, setBrush] = useState(28);
  const [painted, setPainted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    blobToRaster(page.result, 2000).then(setImg).catch(() => notify({ text: "The page could not be opened", tone: "error" }));
  }, [page.result, notify]);

  useEffect(() => {
    if (!img || !view.current || !mask.current) return;
    rasterToCanvas(img, view.current);
    mask.current.width = img.width; mask.current.height = img.height;
  }, [img]);

  const pt = (e: React.PointerEvent) => {
    const c = mask.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, s: c.width / r.width };
  };
  const paint = (e: React.PointerEvent) => {
    const p = pt(e);
    const ctx = mask.current!.getContext("2d")!;
    ctx.strokeStyle = "rgba(232, 163, 23, 0.6)"; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = brush * p.s;
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    const from = last.current ?? p;
    ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    setPainted(true);
  };

  const clear = () => {
    const c = mask.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setPainted(false);
  };

  const erase = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const c = mask.current!;
      const md = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      const m = new Uint8Array(c.width * c.height);
      for (let i = 0; i < m.length; i++) m[i] = md[i * 4 + 3] > 20 ? 1 : 0;
      const r = await runAsync({ op: "inpaint", src: img, mask: m }, 120000);
      if (r.raster) { setImg(r.raster); setEdited(true); }
      clear();
    } catch {
      notify({ text: "That area could not be erased", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      await replaceResult(page, await rasterToBlob(img, 0.92), rasterThumb(img), img.width, img.height);
      notify({ text: "Page updated" });
      onDone(true);
    } catch {
      notify({ text: "The page could not be saved", tone: "error" });
      setBusy(false);
    }
  };

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={() => onDone(false)} aria-label="Back"><I.Back /></button>
        <h1 className="bar-title">Smart erase {label}</h1>
      </header>
      <div className="filter-stage">
        {img ? (
          <div className="erase-box">
            <canvas ref={view} className="erase-view" />
            <canvas
              ref={mask}
              className="erase-mask"
              onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); last.current = null; paint(e); }}
              onPointerMove={(e) => last.current && paint(e)}
              onPointerUp={() => (last.current = null)}
            />
          </div>
        ) : <p className="stage-wait">Opening the page…</p>}
      </div>
      <div className="filter-panel">
        <label className="slider" htmlFor="brush">
          <span className="slider-head"><span>Brush</span><span className="mono">{brush}</span></span>
          <input id="brush" type="range" min={8} max={80} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        </label>
        <p className="muted small">Paint over what should go, then tap Erase. Repeat as needed.</p>
        <div className="row-2">
          <button className="btn btn-quiet" onClick={clear} disabled={!painted || busy}>Clear brush</button>
          <button className="btn btn-quiet" onClick={erase} disabled={!painted || busy}><I.Eraser /> {busy ? "Working…" : "Erase"}</button>
        </div>
      </div>
      <footer className="dock">
        <span className="dock-label">{edited ? "Not saved yet" : "Smart erase"}</span>
        <button className="btn btn-primary" onClick={save} disabled={!edited || busy}>Save page</button>
      </footer>
    </>
  );
}
