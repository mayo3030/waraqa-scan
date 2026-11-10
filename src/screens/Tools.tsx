import * as I from "../icons";
import type { Mode } from "../lib/modes";
import type { DocTool } from "./DocView";

export type FileTool = "pdf-images" | "pdf-long";

interface Props {
  onCamera(mode: Mode): void;
  onImages(b: Blob[]): void;
  onFiles(f: File[]): void;
  onDocTool(t: DocTool): void; // asks which document first
  onPdfFile(t: FileTool, f: File): void;
}

type Item =
  | { kind: "cam"; mode: Mode; label: string; icon: JSX.Element }
  | { kind: "doc"; tool: DocTool; label: string; icon: JSX.Element }
  | { kind: "file"; tool: FileTool; label: string; icon: JSX.Element }
  | { kind: "images" | "files"; label: string; icon: JSX.Element };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Scan",
    items: [
      { kind: "cam", mode: "scan", label: "Smart Scan", icon: <I.Scan /> },
      { kind: "cam", mode: "idcard", label: "ID Cards", icon: <I.IdCard /> },
      { kind: "cam", mode: "idphoto", label: "ID Photo", icon: <I.Person /> },
      { kind: "cam", mode: "book", label: "Book", icon: <I.Book /> },
      { kind: "cam", mode: "receipt", label: "Receipt", icon: <I.Receipt /> },
      { kind: "cam", mode: "whiteboard", label: "Whiteboard", icon: <I.Board /> },
      { kind: "cam", mode: "slides", label: "Slides", icon: <I.Ppt /> },
      { kind: "cam", mode: "mega", label: "Mega Scan", icon: <I.Mega /> },
      { kind: "cam", mode: "timestamp", label: "Timestamp", icon: <I.Stamp /> },
      { kind: "cam", mode: "ocr", label: "Extract Text", icon: <I.Text /> },
    ],
  },
  {
    title: "Import",
    items: [
      { kind: "images", label: "Import Images", icon: <I.Images /> },
      { kind: "files", label: "Import Files", icon: <I.Upload /> },
    ],
  },
  {
    title: "Convert",
    items: [
      { kind: "doc", tool: "word", label: "To Word", icon: <I.Word /> },
      { kind: "doc", tool: "excel", label: "To Excel", icon: <I.Excel /> },
      { kind: "doc", tool: "pptx", label: "To PPT", icon: <I.Ppt /> },
      { kind: "doc", tool: "pdf", label: "To PDF", icon: <I.Pdf /> },
      { kind: "file", tool: "pdf-images", label: "PDF to Images", icon: <I.Images /> },
      { kind: "file", tool: "pdf-long", label: "PDF to Long Image", icon: <I.Long /> },
      { kind: "doc", tool: "long", label: "Long Image", icon: <I.Long /> },
    ],
  },
  {
    title: "Edit",
    items: [
      { kind: "doc", tool: "sign", label: "Sign", icon: <I.Sign /> },
      { kind: "doc", tool: "watermark", label: "Watermark", icon: <I.Drop /> },
      { kind: "doc", tool: "erase", label: "Smart Erase", icon: <I.Eraser /> },
      { kind: "doc", tool: "marks", label: "Erase Marks", icon: <I.Wand /> },
      { kind: "doc", tool: "restore", label: "Restore Photo", icon: <I.Restore /> },
      { kind: "doc", tool: "merge", label: "Merge Files", icon: <I.Merge /> },
      { kind: "doc", tool: "extract", label: "Extract Pages", icon: <I.Cut /> },
      { kind: "doc", tool: "reorder", label: "Reorder Pages", icon: <I.Sort /> },
      { kind: "doc", tool: "lock", label: "Lock with Password", icon: <I.Lock /> },
      { kind: "doc", tool: "compress", label: "Compress", icon: <I.Compress /> },
    ],
  },
  {
    title: "Utilities",
    items: [
      { kind: "doc", tool: "print", label: "Print", icon: <I.Print /> },
      { kind: "cam", mode: "code", label: "Scan Code", icon: <I.Qr /> },
    ],
  },
];

/** Every tool, grouped like the camera, import, convert and edit steps. */
export function Tools({ onCamera, onImages, onFiles, onDocTool, onPdfFile }: Props) {
  const files = (e: React.ChangeEvent<HTMLInputElement>, then: (f: File[]) => void) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length) then(list);
  };
  return (
    <>
      <header className="bar"><h1 className="bar-title">Tools</h1></header>
      <main className="page">
        {GROUPS.map((g) => (
          <section key={g.title} className="tool-group">
            <h2>{g.title}</h2>
            <div className="tool-grid">
              {g.items.map((it) => {
                const body = <><span className="tg-ic">{it.icon}</span><span>{it.label}</span></>;
                if (it.kind === "images" || it.kind === "files" || it.kind === "file") {
                  const id = "tool-" + it.label.replace(/\W+/g, "-").toLowerCase();
                  const accept = it.kind === "images" ? "image/*" : it.kind === "files" ? "application/pdf,.pdf,image/*" : "application/pdf,.pdf";
                  return (
                    <label key={it.label} className="tg-btn" htmlFor={id}>
                      <input id={id} className="file-input" type="file" accept={accept} multiple={it.kind !== "file"}
                        onChange={(e) => files(e, (f) => { if (it.kind === "images") onImages(f); else if (it.kind === "files") onFiles(f); else if (it.kind === "file") onPdfFile(it.tool, f[0]); })} />
                      {body}
                    </label>
                  );
                }
                return (
                  <button key={it.label} className="tg-btn" onClick={() => { if (it.kind === "cam") onCamera(it.mode); else if (it.kind === "doc") onDocTool(it.tool); }}>
                    {body}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <p className="muted small">Everything here runs on your phone. Photo translation, formula solving and AI chat need an online service, so they are not in this version.</p>
      </main>
    </>
  );
}
