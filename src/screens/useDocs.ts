import { useEffect, useState } from "react";
import { listDocs, listFolders, type DocRec, type FolderRec } from "../lib/store";
import { getPage } from "../lib/store";

export interface Row { doc: DocRec; thumb?: string }

/** Every document with its first page thumbnail, newest change first. */
export function useDocs(rev: number): { rows: Row[] | null; folders: FolderRec[] } {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [folders, setFolders] = useState<FolderRec[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const docs = await listDocs();
        const out: Row[] = [];
        for (const doc of docs) {
          const first = doc.pageIds[0];
          out.push({ doc, thumb: first ? (await getPage(first))?.thumb : undefined });
        }
        const f = await listFolders().catch(() => []);
        if (alive) { setRows(out); setFolders(f); }
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  }, [rev]);
  return { rows, folders };
}

export const shortDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Date and time as shown under a document name: 07/13/2026 13:37 in the phone's own order. */
export const stamp = (t: number) => {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
};
