import { useEffect, useMemo, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import type { Raster } from "../lib/geometry";
import { runAsync } from "../lib/engine";
import { rasterToCanvas } from "../lib/io";
import { finishCanvas } from "../lib/stamp";
import { pageFromImage } from "../lib/pagemake";
import { addPages, newDoc } from "../lib/store";
import type { Counted } from "../lib/imaging";

interface Props {
  photo: Raster;
  notify(t: Toast): void;
  onCancel(): void;
  onSaved(docId: string): void;
}

/** CountCam: marks the objects found, the user fixes misses with taps. */
export function CountScreen({ photo, notify, onCancel, onSaved }: Props) {
  const [sens, setSens] = useState(50);
  const [items, setItems] = useState<Counted[] | null>(null);
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => { if (canvas.current) rasterToCanvas(photo, canvas.current); }, [photo]);

  useEffect(() => {
    let cancel = false;
    const t = setTimeout(() => {
      runAsync({ op: "count", src: photo, sensitivity: sens }, 60000)
        .then((r) => { if (!cancel) setItems(r.counted?.items ?? []); })
        .catch(() => { if (!cancel) { setItems([]); notify({ text: "Counting did not finish. Tap the objects to count them.", tone: "error" }); } });
    }, 150);
    return () => { cancel = true; clearTimeout(t); };
  }, [photo, sens, notify]);

  const total = useMemo(() => (items ?? []).reduce((t, b) => t + b.n, 0), [items]);

  const tapImage = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setItems((cur) => [...(cur ?? []), { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, n: 1 }]);
  };
  const tapMark = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setItems((cur) => (cur ?? []).flatMap((b, k) => (k !== i ? [b] : b.n > 1 ? [{ ...b, n: b.n - 1 }] : [])));
  };

  const save = async () => {
    if (!items) return;
    setSaving(true);
    try {
      const c = document.createElement("canvas");
      rasterToCanvas(photo, c);
      const ctx = c.getContext("2d")!;
      const r = Math.max(10, Math.min(c.width, c.height) / 45);
      let n = 0;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const b of items) {
        n += b.n;
        const x = b.x * c.width, y = b.y * c.height;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(242, 179, 61, 0.92)"; ctx.fill();
        ctx.lineWidth = r / 6; ctx.strokeStyle = "#0f1024"; ctx.stroke();
        ctx.fillStyle = "#0f1024";
        ctx.font = `700 ${Math.round(r * (n > 99 ? 0.8 : 1.05))}px system-ui, sans-serif`;
        ctx.fillText(b.n > 1 ? `${n - b.n + 1}-${n}` : String(n), x, y + 1);
      }
      const band = Math.round(r * 3);
      ctx.fillStyle = "rgba(15, 16, 36, 0.78)"; ctx.fillRect(0, 0, c.width, band);
      ctx.fillStyle = "#ffffff"; ctx.font = `700 ${Math.round(band * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = "left"; ctx.fillText(`Total: ${n}`, band * 0.4, band / 2);
      const img = await finishCanvas(c, 0.9);
      const d = await newDoc(`Count ${n}`, { tags: ["Count"] });
      await addPages(d.id, [pageFromImage(img)]);
      onSaved(d.id);
    } catch {
      setSaving(false);
      notify({ text: "The count could not be saved", tone: "error" });
    }
  };

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><I.Close /></button>
        <h1 className="bar-title">CountCam</h1>
        <button className="btn btn-primary" onClick={save} disabled={!items || saving}>{saving ? "Saving" : "Save"}</button>
      </header>
      <main className="page count-page">
        <div className="count-total" aria-live="polite">
          <span className="count-num mono">{items === null ? "…" : total}</span>
          <span className="muted">{items === null ? "Counting" : "Tap to add one it missed, tap a mark to remove it"}</span>
        </div>
        <div className="count-stage" onClick={tapImage}>
          <canvas ref={canvas} className="count-img" />
          {(items ?? []).map((b, i) => (
            <button key={i} className="count-mark" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%` }} onClick={(e) => tapMark(i, e)} aria-label="Remove this mark">
              {b.n > 1 ? `×${b.n}` : ""}
            </button>
          ))}
        </div>
        <label className="slider" htmlFor="count-sens">
          <span className="slider-head"><span>Sensitivity</span><span className="mono">{sens}</span></span>
          <input id="count-sens" type="range" min={0} max={100} value={sens} onChange={(e) => { setItems(null); setSens(Number(e.target.value)); }} />
        </label>
        <p className="muted small">Works best with things that stand apart from a plain background, seen from above.</p>
      </main>
    </>
  );
}
