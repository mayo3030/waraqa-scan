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
