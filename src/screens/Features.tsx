import * as I from "../icons";
import { toneOf } from "../lib/tones";
import type { Mode } from "../lib/modes";
import type { DocTool } from "./DocView";

export type Feature =
  | { kind: "cam"; mode: Mode; label: string; icon: JSX.Element }
  | { kind: "doc"; tool: DocTool; label: string; icon: JSX.Element };

/** The grouped list behind the camera's All features button. */
export const FEATURE_GROUPS: { title: string; items: Feature[] }[] = [
  {
    title: "Scan Documents",
    items: [
      { kind: "cam", mode: "scan", label: "Scan", icon: <I.Scan size={24} /> },
      { kind: "cam", mode: "idcard", label: "ID Cards", icon: <I.IdCard size={24} /> },
      { kind: "cam", mode: "book", label: "Book", icon: <I.Book size={24} /> },
      { kind: "cam", mode: "timestamp", label: "Timestamp", icon: <I.Stamp size={24} /> },
      { kind: "cam", mode: "mega", label: "Mega Scan", icon: <I.Mega size={24} /> },
    ],
  },
  {
    title: "Convert Formats",
    items: [
      { kind: "cam", mode: "word", label: "To Word", icon: <I.Word size={24} /> },
      { kind: "cam", mode: "excel", label: "To Excel", icon: <I.Excel size={24} /> },
    ],
  },
  {
    title: "Doc Tools",
    items: [
      { kind: "doc", tool: "sign", label: "Sign", icon: <I.Sign size={24} /> },
      { kind: "cam", mode: "ocr", label: "Extract Text", icon: <I.Text size={24} /> },
      { kind: "cam", mode: "translate", label: "Translate", icon: <I.Translate size={24} /> },
      { kind: "cam", mode: "question", label: "Incorrect Question", icon: <I.Question size={24} /> },
      { kind: "cam", mode: "formula", label: "Formula", icon: <I.Formula size={24} /> },
      { kind: "cam", mode: "receipt", label: "Receipt", icon: <I.Receipt size={24} /> },
    ],
  },
  {
    title: "Enhance Images",
    items: [
      { kind: "cam", mode: "idphoto", label: "ID Photo Maker", icon: <I.Person size={24} /> },
      { kind: "cam", mode: "restore", label: "Restore Photo", icon: <I.Restore size={24} /> },
      { kind: "cam", mode: "erase", label: "Smart Erase", icon: <I.Eraser size={24} /> },
      { kind: "doc", tool: "ai-hd", label: "AI HD", icon: <I.Hd size={24} /> },
      { kind: "doc", tool: "ai-bg", label: "Remove Background", icon: <I.Cutout size={24} /> },
      { kind: "cam", mode: "code", label: "Scan Code", icon: <I.Qr size={24} /> },
    ],
  },
  {
    title: "Capture Screens",
    items: [
      { kind: "cam", mode: "slides", label: "Slides", icon: <I.Ppt size={24} /> },
      { kind: "cam", mode: "whiteboard", label: "Whiteboard", icon: <I.Board size={24} /> },
    ],
  },
  {
    title: "More",
    items: [
      { kind: "cam", mode: "count", label: "CountCam", icon: <I.Count size={24} /> },
      { kind: "cam", mode: "greeting", label: "Greeting Card", icon: <I.Card size={24} /> },
      { kind: "doc", tool: "chat", label: "AI Chat", icon: <I.Sparkle size={24} /> },
    ],
  },
];

export function FeatureSheet({ onMode, onDocTool, onClose }: { onMode(m: Mode): void; onDocTool(t: DocTool): void; onClose(): void }) {
  return (
    <div className="features" role="dialog" aria-modal="true" aria-label="All features">
      <header className="features-head">
        <h2>All features</h2>
        <button className="cam-btn" onClick={onClose} aria-label="Close"><I.Close /></button>
      </header>
      <div className="features-body">
        {FEATURE_GROUPS.map((g) => (
          <section key={g.title} className="tool-group">
            <h3>{g.title}</h3>
            <div className="tool-grid">
              {g.items.map((it) => (
                <button key={it.label} className="tg-btn" onClick={() => (it.kind === "cam" ? onMode(it.mode) : onDocTool(it.tool))}>
                  <span className="tg-ic" data-tone={toneOf(it.label)}>{it.icon}</span><span>{it.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
