import { useMemo, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import {
  copyPages, deleteDoc, deleteFolder, getDoc, getPages, newDoc, newId, putDoc, putFolder, TAGS, type FolderRec,
} from "../lib/store";
import { shortDate, stamp, useDocs, type Row } from "./useDocs";

interface Props {
  rev: number;
  notify(t: Toast): void;
  onOpen(id: string): void;
  onChanged(): void;
  onImages(b: Blob[]): void;
  onFiles(f: File[]): void;
  onScan(): void;
}

const pickFiles = (e: React.ChangeEvent<HTMLInputElement>, then: (f: File[]) => void) => {
  const list = Array.from(e.target.files ?? []);
  e.target.value = "";
  if (list.length) then(list);
};

type Sort = "modified" | "created" | "name";
type Sheet = null | "folder-new" | "folder-edit" | "move" | "tag" | "delete" | "sort";

function pref<T extends string>(key: string, def: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { return (localStorage.getItem(key) as T) || def; } catch { return def; } });
  return [v, (x) => { setV(x); try { localStorage.setItem(key, x); } catch { /* ignore */ } }];
}

/** All documents: folders, tags, sort, grid or list, and actions on several at once. */
export function Documents({ rev, notify, onOpen, onChanged, onImages, onFiles, onScan }: Props) {
  const { rows, folders } = useDocs(rev);
  const [folder, setFolder] = useState<string | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = pref<Sort>("waraqa-sort", "modified");
  const [view, setView] = pref<"list" | "grid">("waraqa-view", "list");
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [q, setQ] = useState("");
  const [fname, setFname] = useState("");

  const current = folders.find((f) => f.id === folder);
  const usedTags = useMemo(() => {
    const s = new Set<string>();
    rows?.forEach((r) => r.doc.tags?.forEach((t) => s.add(t)));
    return (TAGS.filter((t) => s.has(t)) as string[]).concat([...s].filter((t) => !(TAGS as readonly string[]).includes(t)));
  }, [rows]);

  const shown = useMemo(() => {
    if (!rows) return null;
    const t = q.trim().toLowerCase();
    const list = rows.filter((r) =>
      (folder === "all" || r.doc.folderId === folder) &&
      (!tag || r.doc.tags?.includes(tag)) &&
      (!t || r.doc.name.toLowerCase().includes(t) || (r.doc.text ?? "").toLowerCase().includes(t)));
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      modified: (a, b) => b.doc.updatedAt - a.doc.updatedAt,
      created: (a, b) => b.doc.createdAt - a.doc.createdAt,
      name: (a, b) => a.doc.name.localeCompare(b.doc.name),
    };
    return [...list].sort(by[sort]);
  }, [rows, folder, tag, q, sort]);

  const toggle = (id: string) => {
    const s = new Set(sel ?? []);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSel(s);
  };
  const picked = () => (shown ?? []).filter((r) => sel?.has(r.doc.id)).map((r) => r.doc);
  const done = (text: string) => { setSel(null); setSheet(null); onChanged(); notify({ text }); };

  const merge = async () => {
    const docs = picked();
    if (docs.length < 2) return notify({ text: "Pick two or more documents to merge" });
    const out = await newDoc(`Merged ${shortDate(Date.now())}`, { folderId: current?.id });
    // one document after another, so the pages keep the selection order
    for (const d of docs) await copyPages(await getPages(d), out.id);
    done(`Merged ${docs.length} documents`);
    onOpen(out.id);
  };

  const moveTo = async (fid?: string) => {
    for (const d of picked()) await putDoc({ ...d, folderId: fid, updatedAt: Date.now() });
    done(fid ? "Moved to folder" : "Moved out of folder");
  };

  const toggleTag = async (t: string) => {
    const docs = picked();
    const all = docs.every((d) => d.tags?.includes(t));
    for (const d of docs) {
      const cur = new Set(d.tags ?? []);
      if (all) cur.delete(t); else cur.add(t);
      await putDoc({ ...d, tags: [...cur] });
    }
    done(all ? `Removed “${t}”` : `Tagged “${t}”`);
  };

  const removeAll = async () => {
    const docs = picked();
    for (const d of docs) await deleteDoc(d.id);
    done(`Deleted ${docs.length} ${docs.length === 1 ? "document" : "documents"}`);
  };

  const saveFolder = async () => {
    const n = fname.trim();
    if (!n) return;
    if (sheet === "folder-edit" && current) await putFolder({ ...current, name: n });
    else {
      const f: FolderRec = { id: newId(), name: n, createdAt: Date.now() };
      await putFolder(f);
      if (sel?.size) for (const d of picked()) await putDoc({ ...d, folderId: f.id });
      setFolder(f.id);
    }
    setSheet(null); setSel(null); setFname("");
    onChanged();
  };

  return (
    <>
      <header className={sel ? "bar" : "bar bar-search"}>
        {sel ? (
          <>
            <button className="icon-btn" onClick={() => setSel(null)} aria-label="Stop selecting"><I.Close /></button>
            <h1 className="bar-title">{sel.size} selected</h1>
            <button className="link-btn" onClick={() => setSel(new Set((shown ?? []).map((r) => r.doc.id)))}>All</button>
          </>
        ) : (
          <label className="search" htmlFor="docs-search">
            <I.Search />
            <input id="docs-search" type="search" placeholder="Search" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
      </header>
      <main className={"page" + (sel ? "" : " page-fab")}>
        {!sel && !q && (
          <section className="doc-acts" aria-label="Add">
            <label className="doc-act" htmlFor="docs-files">
              <input id="docs-files" className="file-input" type="file" accept="application/pdf,.pdf,image/*" multiple onChange={(e) => pickFiles(e, onFiles)} />
              <I.Upload size={28} /><span>Import Files</span>
            </label>
            <label className="doc-act" htmlFor="docs-images">
              <input id="docs-images" className="file-input" type="file" accept="image/*" multiple onChange={(e) => pickFiles(e, onImages)} />
              <I.Images size={28} /><span>Import Images</span>
            </label>
            <button className="doc-act" onClick={() => { setFname(""); setSheet("folder-new"); }}>
              <I.Folder size={28} /><span>Create Folder</span>
            </button>
          </section>
        )}

        {!sel && (
          <div className="list-head">
            <h2>{current ? current.name : "All"} <span className="count">({shown?.length ?? 0})</span></h2>
            <button className="icon-btn" onClick={() => setSheet("sort")} aria-label="Sort"><I.Sort /></button>
            <button className="icon-btn" onClick={() => setView(view === "list" ? "grid" : "list")} aria-label={view === "list" ? "Show as grid" : "Show as list"}>
              {view === "list" ? <I.Tiles /> : <I.List />}
            </button>
            <button className="icon-btn" onClick={() => setSel(new Set())} aria-label="Select"><I.Check /></button>
          </div>
        )}
        {usedTags.length > 0 && (
          <div className="chips scroll-x" aria-label="Tags">
            {usedTags.map((t) => (
              <button key={t} className={"chip-btn chip-tag" + (tag === t ? " on" : "")} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
            ))}
          </div>
        )}
        {!current && !sel && !q && folders.length > 0 && (
          <ul className="folder-list">
            {folders.map((f) => (
              <li key={f.id}><button className="folder-row" onClick={() => setFolder(f.id)}><I.Folder size={26} /><span>{f.name}</span><I.Right size={18} /></button></li>
            ))}
          </ul>
        )}
        {current && !sel && (
          <div className="folder-head">
            <button className="link-btn" onClick={() => setFolder("all")}><I.Left size={18} /> All documents</button>
            <button className="link-btn" onClick={() => { setFname(current.name); setSheet("folder-edit"); }}>Rename or delete</button>
          </div>
        )}

        {shown === null && <p className="muted">Opening your documents…</p>}
        {shown && shown.length === 0 && <p className="muted">{rows?.length ? "Nothing here yet." : "No documents yet. Scan a page to start."}</p>}

        {shown && shown.length > 0 && (
          <ul className={view === "grid" ? "doc-grid" : "doc-list"}>
            {shown.map(({ doc, thumb }) => {
              const on = sel?.has(doc.id);
              return (
                <li key={doc.id}>
                  <button
                    className={(view === "grid" ? "doc-tile" : "doc-row") + (on ? " picked" : "")}
                    onClick={() => (sel ? toggle(doc.id) : onOpen(doc.id))}
                    onContextMenu={(e) => { e.preventDefault(); if (!sel) setSel(new Set([doc.id])); }}
                    aria-pressed={sel ? on : undefined}
                  >
                    <span className="doc-thumb">
                      {thumb ? <img src={thumb} alt="" /> : <I.Pdf />}
                      {sel && <span className={"tick" + (on ? " on" : "")}>{on && <I.Check size={14} />}</span>}
                    </span>
                    <span className="doc-meta">
                      <span className="doc-name">{doc.name}</span>
                      <span className="doc-sub">
                        <span>{view === "grid" ? shortDate(sort === "created" ? doc.createdAt : doc.updatedAt) : stamp(sort === "created" ? doc.createdAt : doc.updatedAt)}</span>
                        <span className="sep" aria-hidden="true" />
                        <span className="pages"><I.Docs size={14} /> {doc.pageIds.length}</span>
                        {view === "list" && doc.tags?.map((t) => <span key={t} className="chip">{t}</span>)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Hidden while selecting, so it never sits on top of the actions below. */}
      {!sel && <button className="fab" onClick={onScan} aria-label="Scan"><I.Camera size={30} /></button>}
      {sel && (
        <footer className="dock select-dock">
          <button className="tool" onClick={() => setSheet("move")} disabled={!sel.size}><I.Folder /><span>Move</span></button>
          <button className="tool" onClick={() => setSheet("tag")} disabled={!sel.size}><I.Tag /><span>Tag</span></button>
          <button className="tool" onClick={merge} disabled={sel.size < 2}><I.Merge /><span>Merge</span></button>
          <button className="tool tool-danger" onClick={() => setSheet("delete")} disabled={!sel.size}><I.Trash /><span>Delete</span></button>
        </footer>
      )}

      {sheet && (
        <div className="scrim" onClick={() => setSheet(null)}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {sheet === "sort" && (
              <>
                <div className="sheet-head"><h2>Sort by</h2></div>
                {(["modified", "created", "name"] as Sort[]).map((s) => (
                  <button key={s} className={"menu-row" + (sort === s ? " on" : "")} onClick={() => { setSort(s); setSheet(null); }}>
                    {s === "modified" ? "Last changed" : s === "created" ? "Date made" : "Name"}
                    {sort === s && <I.Check />}
                  </button>
                ))}
              </>
            )}
            {(sheet === "folder-new" || sheet === "folder-edit") && (
              <>
                <div className="sheet-head"><h2>{sheet === "folder-new" ? "New folder" : "Folder"}</h2></div>
                <input className="field" value={fname} onChange={(e) => setFname(e.target.value)} placeholder="Folder name" autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveFolder()} />
                <button className="btn btn-primary wide" onClick={saveFolder} disabled={!fname.trim()}>
                  {sheet === "folder-new" ? (sel?.size ? `Make folder with ${sel.size}` : "Make folder") : "Rename"}
                </button>
                {sheet === "folder-edit" && current && (
                  <button className="btn btn-quiet wide" onClick={async () => { await deleteFolder(current.id); setFolder("all"); setSheet(null); onChanged(); notify({ text: "Folder deleted, its documents are kept" }); }}>
                    Delete folder, keep its documents
                  </button>
                )}
              </>
            )}
            {sheet === "move" && (
              <>
                <div className="sheet-head"><h2>Move {sel?.size} to</h2></div>
                <button className="menu-row" onClick={() => moveTo(undefined)}>No folder</button>
                {folders.map((f) => <button key={f.id} className="menu-row" onClick={() => moveTo(f.id)}><span><I.Folder size={18} /> {f.name}</span></button>)}
                <button className="menu-row" onClick={() => { setFname(""); setSheet("folder-new"); }}><span><I.Plus size={18} /> New folder</span></button>
              </>
            )}
            {sheet === "tag" && (
              <>
                <div className="sheet-head"><h2>Tag {sel?.size}</h2></div>
                <div className="chips wrap">
                  {TAGS.map((t) => {
                    const on = picked().length > 0 && picked().every((d) => d.tags?.includes(t));
                    return <button key={t} className={"chip-btn" + (on ? " on" : "")} onClick={() => toggleTag(t)}><I.Tag size={14} /> {t}</button>;
                  })}
                </div>
              </>
            )}
            {sheet === "delete" && (
              <>
                <div className="sheet-head"><h2>Delete {sel?.size} {sel?.size === 1 ? "document" : "documents"}?</h2></div>
                <p className="muted">Their pages and read text are removed from this phone. This cannot be undone.</p>
                <div className="row-2">
                  <button className="btn btn-quiet" onClick={() => setSheet(null)}>Keep them</button>
                  <button className="btn btn-danger" onClick={removeAll}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Used by DocView "Merge another document". */
export async function mergeInto(targetId: string, sourceId: string) {
  const src = await getDoc(sourceId);
  if (!src) return;
  await copyPages(await getPages(src), targetId);
}
