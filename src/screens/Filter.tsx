import { useEffect, useMemo, useRef, useState } from "react";
import * as I from "../icons";
import type { Session, Toast } from "../App";
import { FILTERS, NO_ADJUST, type Adjust, type FilterKind } from "../lib/filters";
import { flatten, finish } from "../lib/pipeline";
import { rasterThumb, rasterToBlob, rasterToCanvas, shrink } from "../lib/io";
import { defaultName, newId, putDoc, savePage } from "../lib/store";
import type { Raster } from "../lib/geometry";

interface Props {
  s: Session;
  notify(t: Toast): void;
  onBack(s: Session): void;
  onSaved(s: Session, docId: string): void;
}

export function FilterScreen({ s, notify, onBack, onSaved }: Props) {
  const [rotation, setRotation] = useState(s.rotation);
  const [filter, setFilter] = useState<FilterKind>(s.filter);
  const [adjust, setAdjust] = useState<Adjust>(s.adjust);
  const [saving, setSaving] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);

  // Flatten once per rotation; previews work on a smaller copy.
  const flat = useMemo(() => flatten(s.src, s.quad, rotation), [s.src, s.quad, rotation]);
  const preview = useMemo(() => shrink(flat, 1000), [flat]);
  const tiny = useMemo(() => shrink(flat, 150), [flat]);
  const swatches = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, rasterThumb(finish(tiny, f.id, NO_ADJUST), 150)])),
    [tiny],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (view.current) rasterToCanvas(finish(preview, filter, adjust), view.current);
    }, 40);
    return () => clearTimeout(t);
  }, [preview, filter, adjust]);

  const save = async () => {
    setSaving(true);
    // let the button state paint before the heavy work
    await new Promise((r) => setTimeout(r, 30));
    try {
      const out: Raster = finish(flat, filter, adjust);
      const result = await rasterToBlob(out);
      let docId = s.docId;
      if (!docId) {
        docId = newId();
        const now = Date.now();
        await putDoc({ id: docId, name: defaultName(), createdAt: now, updatedAt: now, pageIds: [] });
      }
      await savePage({
        id: s.page?.id ?? newId(),
        docId,
        original: s.original,
        quad: s.quad,
        rotation,
        filter,
        adjust,
        result,
        thumb: rasterThumb(out),
        width: out.width,
        height: out.height,
      });
      onSaved({ ...s, docId }, docId);
    } catch {
      notify({ text: "The page could not be saved. Storage may be full.", tone: "error" });
      setSaving(false);
    }
  };

  const slider = (key: keyof Adjust, label: string) => (
    <label className="slider" htmlFor={"adj-" + key}>
      <span className="slider-head">
        <span>{label}</span>
        <span className="mono">{adjust[key] > 0 ? "+" : ""}{adjust[key]}</span>
      </span>
      <input
        id={"adj-" + key}
        type="range"
        min={-60}
        max={60}
        value={adjust[key]}
        onChange={(e) => setAdjust((a) => ({ ...a, [key]: Number(e.target.value) }))}
        onDoubleClick={() => setAdjust((a) => ({ ...a, [key]: 0 }))}
      />
    </label>
  );

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={() => onBack({ ...s, rotation, filter, adjust })} aria-label="Back to corners">
          <I.Back />
        </button>
        <h1 className="bar-title">Clean up</h1>
        <span className="bar-step mono">2 / 2</span>
      </header>
      <div className="filter-stage">
        <canvas ref={view} className="sheet" />
      </div>
      <div className="filter-panel">
        <div className="swatches" role="radiogroup" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={filter === f.id}
              className={"swatch" + (filter === f.id ? " on" : "")}
              onClick={() => setFilter(f.id)}
              title={f.hint}
            >
              <img src={swatches[f.id]} alt="" />
              <span>{f.label}</span>
            </button>
          ))}
        </div>
        <div className="sliders">
          {slider("brightness", "Brightness")}
          {slider("contrast", "Contrast")}
        </div>
      </div>
      <footer className="dock">
        <div className="tool-row">
          <button className="tool" onClick={() => setRotation((r) => (r + 1) % 4)}><I.Rotate /><span>Rotate</span></button>
          {(adjust.brightness !== 0 || adjust.contrast !== 0) && (
            <button className="tool" onClick={() => setAdjust(NO_ADJUST)}><span>Reset</span></button>
          )}
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : s.page ? "Update page" : s.queue.length ? "Save, next photo" : "Save page"}
        </button>
      </footer>
    </>
  );
}
