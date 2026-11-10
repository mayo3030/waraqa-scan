import { useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import type { Raster } from "../lib/geometry";
import { rasterToCanvas } from "../lib/io";
import { finishCanvas } from "../lib/stamp";
import { pageFromImage } from "../lib/pagemake";
import { addPages, newDoc } from "../lib/store";

interface Props {
  photo: Raster;
  notify(t: Toast): void;
  onCancel(): void;
  onSaved(docId: string): void;
}

type Design = "sunrise" | "paper" | "garden" | "night";
const DESIGNS: { id: Design; label: string; title: string; message: string }[] = [
  { id: "sunrise", label: "Sunrise", title: "Happy Birthday", message: "Wishing you a year full of good days." },
  { id: "paper", label: "Paper", title: "Thank You", message: "For everything you did. It meant a lot." },
  { id: "garden", label: "Garden", title: "Congratulations", message: "So proud of you. Enjoy every bit of it." },
  { id: "night", label: "Night", title: "With Love", message: "Thinking of you today." },
];

const W = 1500, H = 2100;

/** Draws the photo to fill the box, cropping what does not fit. */
function cover(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function drawCard(c: HTMLCanvasElement, photo: HTMLCanvasElement, d: Design, title: string, message: string, from: string) {
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let ink = "#1d1f4a", sub = "#3d3f66", titleY = 1420;
  if (d === "sunrise") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#fde1a8"); g.addColorStop(1, "#f08a63");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(150, 150, W - 300, 1100, 60); ctx.clip();
    cover(ctx, photo, 150, 150, W - 300, 1100);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(W / 2, H + 200, 500 + i * 120, Math.PI, 0); ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.stroke(); }
    ink = "#4a1d12"; sub = "#6b2f1e";
  } else if (d === "paper") {
    ctx.fillStyle = "#f6f1e6"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#2b3a67"; ctx.lineWidth = 6; ctx.strokeRect(60, 60, W - 120, H - 120);
    ctx.lineWidth = 2; ctx.strokeRect(84, 84, W - 168, H - 168);
    ctx.save();
    ctx.translate(W / 2, 700); ctx.rotate(-0.035);
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillRect(-520, -520, 1040, 1120);
    ctx.shadowColor = "transparent";
    cover(ctx, photo, -480, -480, 960, 960);
    ctx.restore();
    ink = "#2b3a67"; sub = "#4b587f"; titleY = 1500;
  } else if (d === "garden") {
    ctx.fillStyle = "#2f5d50"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = (i * 337) % W, y = (i * 571) % H;
      ctx.fillStyle = i % 3 ? "rgba(242,179,61,0.55)" : "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(x, y, 6 + (i % 4) * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, 720, 520, 0, Math.PI * 2); ctx.clip();
    cover(ctx, photo, W / 2 - 520, 200, 1040, 1040);
    ctx.restore();
    ctx.beginPath(); ctx.arc(W / 2, 720, 535, 0, Math.PI * 2); ctx.lineWidth = 14; ctx.strokeStyle = "#f2b33d"; ctx.stroke();
    ink = "#fdf6e3"; sub = "#d9e8df"; titleY = 1460;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14163a"); g.addColorStop(1, "#2a2d6b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const x = (i * 211) % W, y = (i * 389) % H;
      ctx.fillStyle = `rgba(242,179,61,${0.25 + (i % 5) * 0.12})`;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3) * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(220, 1250); ctx.lineTo(220, 700); ctx.arc(W / 2, 700, W / 2 - 220, Math.PI, 0); ctx.lineTo(W - 220, 1250); ctx.closePath();
    ctx.clip();
    cover(ctx, photo, 220, 170, W - 440, 1080);
    ctx.restore();
    ink = "#f7e7c1"; sub = "#c9cbef";
  }
  ctx.fillStyle = ink;
  ctx.font = `italic 700 128px Georgia, "Times New Roman", serif`;
  ctx.direction = /[؀-ۿ]/.test(title) ? "rtl" : "ltr";
  ctx.fillText(title, W / 2, titleY, W - 240);
  ctx.font = `400 64px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = sub;
  const lines = wrap(ctx, message, W - 360).slice(0, 5);
  lines.forEach((l, i) => { ctx.direction = /[؀-ۿ]/.test(l) ? "rtl" : "ltr"; ctx.fillText(l, W / 2, titleY + 130 + i * 84); });
  if (from.trim()) {
    ctx.font = `italic 400 60px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = ink;
    ctx.fillText(from.trim(), W / 2, Math.min(H - 150, titleY + 170 + lines.length * 84 + 40));
  }
}

/** Greeting Card: a photo on one of a few designs, with your own words. */
export function GreetingScreen({ photo, notify, onCancel, onSaved }: Props) {
  const [design, setDesign] = useState<Design>("sunrise");
  const [title, setTitle] = useState(DESIGNS[0].title);
  const [message, setMessage] = useState(DESIGNS[0].message);
  const [from, setFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);
  const src = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { src.current = rasterToCanvas(photo, document.createElement("canvas")); }, [photo]);
  useEffect(() => {
    const t = setTimeout(() => { if (view.current && src.current) drawCard(view.current, src.current, design, title, message, from); }, 60);
    return () => clearTimeout(t);
  }, [design, title, message, from, photo]);

  const pick = (d: Design) => {
    const was = DESIGNS.find((x) => x.id === design)!, next = DESIGNS.find((x) => x.id === d)!;
    if (title === was.title) setTitle(next.title);
    if (message === was.message) setMessage(next.message);
    setDesign(d);
  };

  const save = async () => {
    if (!src.current) return;
    setSaving(true);
    try {
      const c = document.createElement("canvas");
      drawCard(c, src.current, design, title, message, from);
      const img = await finishCanvas(c, 0.92);
      const d = await newDoc(title.trim() || "Greeting card", { tags: ["Card"] });
      await addPages(d.id, [pageFromImage(img)]);
      onSaved(d.id);
    } catch {
      setSaving(false);
      notify({ text: "The card could not be saved", tone: "error" });
    }
  };

  return (
    <>
      <header className="bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><I.Close /></button>
        <h1 className="bar-title">Greeting Card</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving" : "Save"}</button>
      </header>
      <main className="page card-page">
        <canvas ref={view} className="card-preview" aria-label="Card preview" />
        <div className="chips" role="radiogroup" aria-label="Design">
          {DESIGNS.map((d) => (
            <button key={d.id} role="radio" aria-checked={design === d.id} className={"chip-btn" + (design === d.id ? " on" : "")} onClick={() => pick(d.id)}>{d.label}</button>
          ))}
        </div>
        <label className="field-row" htmlFor="gc-title"><span>Title</span><input id="gc-title" className="field" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field-col" htmlFor="gc-msg"><span>Message</span><textarea id="gc-msg" className="field" dir="auto" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <label className="field-row" htmlFor="gc-from"><span>From</span><input id="gc-from" className="field" dir="auto" placeholder="Your name" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </main>
    </>
  );
}
