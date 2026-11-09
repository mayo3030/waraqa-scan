import { useEffect, useMemo, useState } from "react";
import * as I from "../icons";
import { getPages, listDocs, memoryOnly, type DocRec } from "../lib/store";
import { PhotoButtons } from "./PhotoButtons";
import { UpdateButton } from "./UpdateButton";

interface Props {
  rev: number;
  onOpen(id: string): void;
  onPhotos(b: Blob[]): void;
}

interface Row { doc: DocRec; thumb?: string }

export function Home({ rev, onOpen, onPhotos }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const docs = await listDocs();
        const out: Row[] = [];
        for (const doc of docs) {
          const first = doc.pageIds[0];
          let thumb: string | undefined;
          if (first) thumb = (await getPages({ ...doc, pageIds: [first] }))[0]?.thumb;
          out.push({ doc, thumb });
        }
        if (alive) setRows(out);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  }, [rev]);

  const shown = useMemo(() => {
    if (!rows) return null;
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.doc.name.toLowerCase().includes(t) || (r.doc.text ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <>
      <header className="bar">
        <div className="brand">
          <I.Mark />
          <span className="brand-name">Waraqa</span>
          <span className="brand-ar" lang="ar">ورقة</span>
        </div>
        <UpdateButton />
      </header>
      <main className="page">
        <label className="search" htmlFor="doc-search">
          <I.Search />
          <input
            id="doc-search"
            type="search"
            placeholder="Search names and scanned text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {shown === null && <p className="muted">Opening your documents…</p>}
        {shown !== null && memoryOnly && (
          <p className="note">This view cannot keep files on your phone, so scans last only until you close the page. Save them as PDF to keep them.</p>
        )}

        {shown && rows && rows.length === 0 && (
          <section className="empty">
            <div className="empty-art" aria-hidden="true"><I.Mark size={64} /></div>
            <h2>Scan your first page</h2>
            <p>Photograph a receipt, a contract or a title. Waraqa finds the edges, flattens the page and cleans it up. Everything stays on this phone.</p>
          </section>
        )}

        {shown && rows && rows.length > 0 && shown.length === 0 && (
          <p className="muted">No document matches “{q}”.</p>
        )}

        {shown && shown.length > 0 && (
          <ul className="doc-list">
            {shown.map(({ doc, thumb }) => (
              <li key={doc.id}>
                <button className="doc-row" onClick={() => onOpen(doc.id)}>
                  <span className="doc-thumb">{thumb ? <img src={thumb} alt="" /> : <I.Pdf />}</span>
                  <span className="doc-meta">
                    <span className="doc-name">{doc.name}</span>
                    <span className="doc-sub">
                      <span className="mono">{doc.pageIds.length} {doc.pageIds.length === 1 ? "page" : "pages"}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      {doc.sample && <span className="chip">Example</span>}
                      {doc.text && <span className="chip chip-ok">Text</span>}
                    </span>
                  </span>
                  <I.Right />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="dock">
        <PhotoButtons onPhotos={onPhotos} />
      </footer>
    </>
  );
}
