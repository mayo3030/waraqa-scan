import { useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import { replaceResult, type PageRec } from "../lib/store";
import { decodeImageElement } from "../lib/canvasimg";
import { finishCanvas } from "../lib/stamp";

interface Props {
  page: PageRec;
  label: string;
  notify(t: Toast): void;
  onDone(changed: boolean): void;
}

const KEY = "waraqa-signatures";
function loadSigs(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveSigs(s: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(s.slice(0, 6))); } catch { /* full */ }
}

/** Draw a signature (kept on this phone) and place it on the page. */
export function SignScreen({ page, label, notify, onDone }: Props) {
  const [sigs, setSigs] = useState<string[]>(loadSigs);
  const [pad, setPad] = useState(() => loadSigs().length === 0);
  const [chosen, setChosen] = useState<string | null>(() => loadSigs()[0] ?? null);
  const [pos, setPos] = useState({ x: 0.55, y: 0.78, w: 0.32 }); // fractions of the page
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(page.result);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [page.result]);

  const onDown = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    drag.current = { dx: (e.clientX - r.left) / r.width - pos.x, dy: (e.clientY - r.top) / r.height - pos.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const r = box.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - drag.current.dx;
    const y = (e.clientY - r.top) / r.height - drag.current.dy;
    setPos((p) => ({ ...p, x: Math.min(1 - p.w, Math.max(0, x)), y: Math.min(0.97, Math.max(0, y)) }));
  };

  const apply = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      const [img, sig] = await Promise.all([decodeImageElement(page.result), loadDataUrl(chosen)]);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const w = pos.w * c.width, h = (w * sig.naturalHeight) / sig.naturalWidth;
      ctx.drawImage(sig, pos.x * c.width, pos.y * c.height, w, h);
      const out = await finishCanvas(c, 0.92);
      await replaceResult(page, out.blob, out.thumb, out.width, out.height);
      notify({ text: "Signature added" });
      onDone(true);
    } catch {
      notify({ text: "The signature could not be added", tone: "error" });
      setSaving(false);
    }
  };

  const remove = (s: string) => {
    const next = sigs.filter((x) => x !== s);
    setSigs(next); saveSigs(next);
    if (chosen === s) setChosen(next[0] ?? null);
  };

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={() => onDone(false)} aria-label="Back"><I.Back /></button>
        <h1 className="bar-title">Sign {label}</h1>
      </header>
      <div className="filter-stage">
        <div className="place-box" ref={box}>
          {url && <img src={url} alt="Page" className="place-page" />}
          {chosen && url && (
            <img
              src={chosen}
              alt="Your signature"
              className="place-sig"
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: `${pos.w * 100}%` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              draggable={false}
            />
          )}
        </div>
      </div>
      <div className="filter-panel">
        <div className="sig-row">
          {sigs.map((s) => (
            <span key={s} className={"sig-pick" + (s === chosen ? " on" : "")}>
              <button onClick={() => setChosen(s)} aria-label="Use this signature"><img src={s} alt="" /></button>
              <button className="sig-x" onClick={() => remove(s)} aria-label="Delete this signature">✕</button>
            </span>
          ))}
          <button className="sig-new" onClick={() => setPad(true)}><I.Plus /> New</button>
        </div>
        {chosen && (
          <label className="slider" htmlFor="sig-size">
            <span className="slider-head"><span>Size</span></span>
            <input id="sig-size" type="range" min={10} max={70} value={Math.round(pos.w * 100)}
              onChange={(e) => { const w = Number(e.target.value) / 100; setPos((p) => ({ ...p, w, x: Math.min(p.x, 1 - w) })); }} />
          </label>
        )}
        <p className="muted small">Drag the signature into place. Signatures stay on this phone.</p>
      </div>
      <footer className="dock">
        <span className="dock-label">Sign</span>
        <button className="btn btn-primary" onClick={apply} disabled={!chosen || saving}>{saving ? "Saving…" : "Add to page"}</button>
      </footer>
      {pad && (
        <SignaturePad
          onCancel={() => setPad(false)}
          onSave={(d) => { const next = [d, ...sigs]; setSigs(next); saveSigs(next); setChosen(d); setPad(false); }}
        />
      )}
    </>
  );
}

function loadDataUrl(d: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = d; });
}

function SignaturePad({ onCancel, onSave }: { onCancel(): void; onSave(d: string): void }) {
  const c = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#111426");
  const [empty, setEmpty] = useState(true);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const cv = c.current!;
    cv.width = 900; cv.height = 360;
  }, []);

  const pt = (e: React.PointerEvent) => {
    const r = c.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 900, y: ((e.clientY - r.top) / r.height) * 360 };
  };
  const down = (e: React.PointerEvent) => { last.current = pt(e); (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const p = pt(e);
    const ctx = c.current!.getContext("2d")!;
    ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    setEmpty(false);
  };
  const clear = () => { c.current!.getContext("2d")!.clearRect(0, 0, 900, 360); setEmpty(true); };

  const save = () => {
    // Trim to the ink so the signature places tightly.
    const cv = c.current!;
    const ctx = cv.getContext("2d")!;
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (d[(y * cv.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 <= x0) return;
    const pad = 8;
    const t = document.createElement("canvas");
    t.width = x1 - x0 + pad * 2; t.height = y1 - y0 + pad * 2;
    t.getContext("2d")!.drawImage(cv, x0 - pad, y0 - pad, t.width, t.height, 0, 0, t.width, t.height);
    onSave(t.toDataURL("image/png"));
  };

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Draw your signature</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><I.Close /></button>
        </div>
        <canvas ref={c} className="sig-pad" onPointerDown={down} onPointerMove={move} onPointerUp={() => (last.current = null)} onPointerLeave={() => (last.current = null)} />
        <div className="chips">
          {[["#111426", "Black"], ["#1d3fb8", "Blue"]].map(([v, n]) => (
            <button key={v} className={"chip-btn" + (color === v ? " on" : "")} onClick={() => setColor(v)}>
              <span className="dot" style={{ background: v }} /> {n}
            </button>
          ))}
        </div>
        <div className="row-2">
          <button className="btn btn-quiet" onClick={clear}>Clear</button>
          <button className="btn btn-primary" onClick={save} disabled={empty}>Save signature</button>
        </div>
      </div>
    </div>
  );
}
