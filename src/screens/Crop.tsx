import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Session } from "../App";
import { fullQuad, isConvex, orderQuad, type Pt, type Quad } from "../lib/geometry";
import { rasterToCanvas } from "../lib/io";
import { detectAsync } from "../lib/engine";

interface Props {
  s: Session;
  onCancel(): void;
  onNext(s: Session): void;
}

const LOUPE = 112;
const ZOOM = 2.5;

export function CropScreen({ s, onCancel, onNext }: Props) {
  const [quad, setQuad] = useState<Quad>(s.quad);
  const [found, setFound] = useState(s.autoFound);
  const [scale, setScale] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const srcCanvas = useRef<HTMLCanvasElement | null>(null);

  // Draw the photo once and size it to the available space.
  useLayoutEffect(() => {
    srcCanvas.current = rasterToCanvas(s.src);
    const fit = () => {
      const el = wrap.current;
      if (!el) return;
      // clientWidth and clientHeight include the stage's padding: leave it out, or the photo
      // is drawn wider than the room it has and a corner ends up off the screen.
      const cs = getComputedStyle(el);
      const maxW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const maxH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (maxW <= 0 || maxH <= 0) return;
      setScale(Math.min(maxW / s.src.width, maxH / s.src.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [s.src]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !scale || !srcCanvas.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(s.src.width * scale * dpr);
    c.height = Math.round(s.src.height * scale * dpr);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas.current, 0, 0, c.width, c.height);
  }, [scale, s.src]);

  // Magnifier under the finger so corners can be placed precisely.
  useEffect(() => {
    if (drag === null || !loupe.current || !srcCanvas.current) return;
    const p = quad[drag];
    const ctx = loupe.current.getContext("2d")!;
    const r = LOUPE / ZOOM / 2 / scale;
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(srcCanvas.current, p.x - r, p.y - r, r * 2, r * 2, 0, 0, LOUPE, LOUPE);
    ctx.strokeStyle = "#E8A317";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(LOUPE / 2, LOUPE / 2 - 12); ctx.lineTo(LOUPE / 2, LOUPE / 2 + 12);
    ctx.moveTo(LOUPE / 2 - 12, LOUPE / 2); ctx.lineTo(LOUPE / 2 + 12, LOUPE / 2);
    ctx.stroke();
  }, [drag, quad, scale]);

  const W = s.src.width * scale, H = s.src.height * scale;
  const valid = isConvex(quad);

  const toImg = (e: React.PointerEvent): Pt => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale, y = (e.clientY - rect.top) / scale;
    return { x: Math.min(s.src.width, Math.max(0, x)), y: Math.min(s.src.height, Math.max(0, y)) };
  };

  const onDown = (i: number) => (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag(i);
    setNote(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const p = toImg(e);
    setQuad((q) => q.map((v, k) => (k === drag ? p : v)) as Quad);
  };
  const onUp = () => {
    if (drag === null) return;
    setDrag(null);
    setQuad((q) => {
      const o = orderQuad(q);
      return isConvex(o) ? o : q;
    });
    setFound(false);
  };

  const auto = async () => {
    setNote("Looking for the page…");
    try {
      const d = await detectAsync(s.src);
      setQuad(d.quad);
      setFound(d.found);
      setNote(d.found ? null : "No clear page edge found. Drag the corners to the page.");
    } catch {
      setNote("Automatic edges are not available here. Drag the corners to the page.");
    }
  };

  const pts = quad.map((p) => `${p.x * scale},${p.y * scale}`).join(" ");
  const loupePos = drag !== null && quad[drag].x * scale < W / 2 ? "right" : "left";

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><I.Back /></button>
        <h1 className="bar-title">Adjust corners</h1>
        <span className="bar-step mono">1 / 2</span>
      </header>
      <div className="crop-stage" ref={wrap}>
        {scale > 0 && (
          <div className="crop-box" style={{ width: W, height: H }}>
            <canvas ref={canvas} style={{ width: W, height: H }} />
            <svg
              className="crop-svg"
              width={W}
              height={H}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <defs>
                <mask id="crop-hole">
                  <rect width={W} height={H} fill="white" />
                  <polygon points={pts} fill="black" />
                </mask>
              </defs>
              <rect width={W} height={H} className="crop-dim" mask="url(#crop-hole)" />
              <polygon points={pts} className={"crop-edge" + (valid ? "" : " crop-bad")} />
              {quad.map((p, i) => (
                <g key={i} role="button" aria-label={`Corner ${i + 1}`} className={"handle" + (drag === i ? " active" : "")} onPointerDown={onDown(i)}>
                  <circle cx={p.x * scale} cy={p.y * scale} r={22} className="handle-hit" />
                  <circle cx={p.x * scale} cy={p.y * scale} r={9} className="handle-dot" />
                </g>
              ))}
            </svg>
            {drag !== null && (
              <canvas ref={loupe} width={LOUPE} height={LOUPE} className={"loupe loupe-" + loupePos} />
            )}
          </div>
        )}
      </div>
      <div className="crop-status" aria-live="polite">
        {note ?? (found ? "Page found. Drag a corner if it is off." : "Drag the four corners onto the page corners.")}
      </div>
      <footer className="dock">
        <div className="tool-row">
          <button className="tool" onClick={auto}><I.Scan /><span>Auto</span></button>
          <button className="tool" onClick={() => { setQuad(fullQuad(s.src.width, s.src.height)); setFound(false); setNote(null); }}>
            <I.Expand /><span>Whole photo</span>
          </button>
        </div>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onNext({ ...s, quad })}>
          Next
        </button>
      </footer>
    </>
  );
}
