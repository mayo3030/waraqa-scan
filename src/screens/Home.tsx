import { useMemo, useState } from "react";
import * as I from "../icons";
import { memoryOnly } from "../lib/store";
import type { Mode } from "../lib/modes";
import { UpdateButton } from "./UpdateButton";
import { stamp, useDocs } from "./useDocs";
import type { DocTool } from "./DocView";

interface Props {
  rev: number;
  onOpen(id: string, tool?: DocTool): void;
  onCamera(mode: Mode): void;
  onImages(b: Blob[]): void;
  onFiles(f: File[]): void;
  onShare(id: string): void;
  onAllTools(): void;
  onAllDocs(): void;
}

const QUICK: { mode: Mode; label: string; icon: JSX.Element }[] = [
  { mode: "idcard", label: "ID Cards", icon: <I.IdCard size={24} /> },
  { mode: "ocr", label: "Extract Text", icon: <I.Text size={24} /> },
  { mode: "word", label: "To Word", icon: <I.Word size={24} /> },
  { mode: "code", label: "Scan Code", icon: <I.Qr size={24} /> },
];

export function Home({ rev, onOpen, onCamera, onImages, onFiles, onShare, onAllTools, onAllDocs }: Props) {
  const { rows } = useDocs(rev);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    if (!rows) return null;
    const t = q.trim().toLowerCase();
    const list = t ? rows.filter((r) => r.doc.name.toLowerCase().includes(t) || (r.doc.text ?? "").toLowerCase().includes(t)) : rows;
    return t ? list : list.slice(0, 8);
  }, [rows, q]);

  const pickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onImages(files);
  };
  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };

  return (
    <>
      <header className="bar bar-search">
        <label className="search" htmlFor="doc-search">
          <I.Search />
          <input id="doc-search" type="search" placeholder="Search" aria-label="Search names and scanned text" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <UpdateButton />
      </header>
      <main className="page page-fab">

        {!q && (
          <section className="quick" aria-label="Quick actions">
            <button className="quick-btn quick-main" onClick={() => onCamera("scan")}>
              <span className="quick-ic"><I.Scan size={26} /></span><span>Smart Scan</span>
            </button>
            <label className="quick-btn" htmlFor="home-images">
              <input id="home-images" className="file-input" type="file" accept="image/*" multiple onChange={pickImages} />
              <span className="quick-ic"><I.Images size={24} /></span><span>Import Images</span>
            </label>
            <label className="quick-btn" htmlFor="home-files">
              <input id="home-files" className="file-input" type="file" accept="application/pdf,.pdf,image/*" multiple onChange={pickFiles} />
              <span className="quick-ic"><I.Upload size={24} /></span><span>Import Files</span>
            </label>
            {QUICK.map((x) => (
              <button key={x.mode} className="quick-btn" onClick={() => onCamera(x.mode)}>
                <span className="quick-ic">{x.icon}</span><span>{x.label}</span>
              </button>
            ))}
            <button className="quick-btn" onClick={onAllTools}>
              <span className="quick-ic"><I.Tools size={24} /></span><span>All</span>
            </button>
          </section>
        )}

        {shown !== null && memoryOnly && (
          <p className="note">This view cannot keep files on your phone, so scans last only until you close the page. Save them as PDF to keep them.</p>
        )}

        {rows && rows.length === 0 && !q && (
          <section className="empty">
            <div className="empty-art" aria-hidden="true"><I.Mark size={64} /></div>
            <h2>Scan your first page</h2>
            <p>Photograph a receipt, a contract or a card. Waraqa finds the edges, flattens the page and cleans it up. Everything stays on this phone.</p>
          </section>
        )}

        {shown && shown.length > 0 && (
          <section className="recents">
            <div className="section-head">
              <h2>{q ? "Results" : "Recents"}</h2>
              {!q && <button className="view-all" onClick={onAllDocs}>View All <I.Right size={16} /></button>}
            </div>
            <ul className="doc-list">
              {shown.map(({ doc, thumb }, i) => (
                <li key={doc.id} className="recent">
                  <button className="doc-row" onClick={() => onOpen(doc.id)}>
                    <span className="doc-thumb">{thumb ? <img src={thumb} alt="" /> : <I.Pdf />}</span>
                    <span className="doc-meta">
                      <span className="doc-name">{doc.name}</span>
                      <span className="doc-sub">
                        <span>{stamp(doc.updatedAt)}</span>
                        <span className="sep" aria-hidden="true" />
                        <span className="pages"><I.Docs size={14} /> {doc.pageIds.length}</span>
                        {doc.sample && <span className="chip">Example</span>}
                        {doc.tags?.slice(0, 1).map((t) => <span key={t} className="chip">{t}</span>)}
                      </span>
                    </span>
                  </button>
                  {i === 0 && !q && <div className="recent-acts">
                    <button onClick={() => onShare(doc.id)} disabled={!doc.pageIds.length}>Share</button>
                    <button onClick={() => onOpen(doc.id, "word")} disabled={!doc.pageIds.length}><I.Word size={18} /> To Word</button>
                    <button onClick={() => onOpen(doc.id)}>View</button>
                  </div>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {q && shown && shown.length === 0 && <p className="muted">No document matches “{q}”.</p>}
      </main>
    </>
  );
}
