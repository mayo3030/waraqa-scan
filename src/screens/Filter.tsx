import { useEffect, useMemo, useRef, useState } from "react";
import * as I from "../icons";
import type { Session, Toast } from "../App";
import { FILTERS, NO_ADJUST, type Adjust, type FilterKind } from "../lib/filters";
import { finish } from "../lib/pipeline";
import { finishAsync, flattenAsync } from "../lib/engine";
import { rasterThumb, rasterToBlob, rasterToCanvas, shrink } from "../lib/io";
import { defaultName, newId, putDoc, savePage } from "../lib/store";
import type { Raster } from "../lib/geometry";
import { findGlare } from "../lib/deglare";

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
  const [flat, setFlat] = useState<Raster | null>(null);
  const view = useRef<HTMLCanvasElement>(null);

  // Flattening a full photo on the UI thread freezes the phone, so it runs
  // in the background. Previews stay on a smaller copy.
  useEffect(() => {
    let cancel = false;
    setFlat(null);
    flattenAsync(s.src, s.quad, rotation, s.hd ? 3200 : 2000)
      .then((r) => { if (!cancel) setFlat(r); })
      .catch(() => { if (!cancel) notify({ text: "The page could not be prepared", tone: "error" }); });
    return () => { cancel = true; };
  }, [s.src, s.quad, rotation, notify]);

  const preview = useMemo(() => (flat ? shrink(flat, 1000) : null), [flat]);
  // Shiny cards: say when the flash burned part of it, and how to get a clean copy.
  const glare = useMemo(() => !!flat && s.mode === "idcard" && !s.flat && findGlare(flat).found, [flat, s.mode, s.flat]);
  const swatches = useMemo(() => {
    if (!flat) return {} as Record<string, string>;
    const tiny = shrink(flat, 150);
    return Object.fromEntries(FILTERS.map((f) => [f.id, rasterThumb(finish(tiny, f.id, NO_ADJUST), 150)]));
  }, [flat]);

  useEffect(() => {
    if (!preview) return;
    let cancel = false;
    const t = setTimeout(() => {
      if (cancel || !view.current) return;
      rasterToCanvas(finish(preview, filter, adjust), view.current);
    }, 40);
    return () => { cancel = true; clearTimeout(t); };
  }, [preview, filter, adjust]);

  const save = async () => {
    if (!flat) return;
    setSaving(true);
    // let the button state paint before the heavy work
    await new Promise((r) => setTimeout(r, 30));
    try {
      const out: Raster = await finishAsync(flat, filter, adjust);
      const result = await rasterToBlob(out, 0.93);
      let docId = s.docId;
      if (!docId) {
        docId = newId();
        const now = Date.now();
        await putDoc({ id: docId, name: defaultName(), createdAt: now, updatedAt: now, pageIds: [] });
      }
      const pid = s.page?.id ?? newId();
      await savePage({
        id: pid,
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
      onSaved({ ...s, docId, fresh: s.page ? s.fresh : [...(s.fresh ?? []), pid] }, docId);
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
        {flat ? <canvas ref={view} className="sheet" /> : <p className="stage-wait">Preparing the page…</p>}
        {glare && (
          <p className="glare-tip" role="note">
            <I.FlashOff size={18} />
            <span>Flash glare on the card. For a clean copy, turn on <b>Remove glare</b> in ID Cards: take 2 photos of each side, tilting the phone a little.</span>
          </p>
        )}
      </div>
      <div className="filter-panel">
        <div className="swatches" role="radiogroup" aria-label="Filter" ref={(el) => {
          el?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={filter === f.id}
              className={"swatch" + (filter === f.id ? " on" : "")}
              onClick={() => setFilter(f.id)}
              title={f.hint}
            >
              {swatches[f.id] ? <img src={swatches[f.id]} alt="" /> : <span className="swatch-ph" />}
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
        <button className="btn btn-primary" onClick={save} disabled={saving || !flat}>
          {saving ? "Saving…" : s.page ? "Update page" : s.queue.length ? "Save, next photo" : "Save page"}
        </button>
      </footer>
    </>
  );
}
