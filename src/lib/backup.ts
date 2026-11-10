// Backup and restore: every document, page and folder in one file.
//
// File layout (.waraqa):
//   8 bytes  "WARAQABK"
//   4 bytes  format version (uint32, little endian)
//   4 bytes  header length in bytes (uint32, little endian)
//   header   UTF-8 JSON: docs, folders, and pages with their image blobs
//            replaced by { o, l, t } = offset into the data part, length, MIME type
//   data     the page images back to back
import type { DocRec, FolderRec, PageRec } from "./store";

export const BACKUP_EXT = ".waraqa";
const MAGIC = "WARAQABK";
const FORMAT = 1;

export class BackupError extends Error {}

interface BlobRef { o: number; l: number; t: string }
type PageMeta = Omit<PageRec, "original" | "result"> & { original: BlobRef; result: BlobRef };

interface Header {
  app: "waraqa-scan";
  createdAt: number;
  docs: DocRec[];
  folders: FolderRec[];
  pages: PageMeta[];
}

export interface BackupData {
  createdAt: number;
  docs: DocRec[];
  folders: FolderRec[];
  pages: PageRec[];
}

/** Packs everything into one Blob. */
export async function packBackup(data: Omit<BackupData, "createdAt">, now = Date.now()): Promise<Blob> {
  const parts: Blob[] = [];
  let offset = 0;
  const ref = (b: Blob): BlobRef => {
    const r = { o: offset, l: b.size, t: b.type || "image/jpeg" };
    parts.push(b);
    offset += b.size;
    return r;
  };
  const pages: PageMeta[] = data.pages.map((p) => ({ ...p, original: ref(p.original), result: ref(p.result) }));
  const header: Header = { app: "waraqa-scan", createdAt: now, docs: data.docs, folders: data.folders, pages };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const head = new Uint8Array(16);
  head.set(new TextEncoder().encode(MAGIC), 0);
  const dv = new DataView(head.buffer);
  dv.setUint32(8, FORMAT, true);
  dv.setUint32(12, json.length, true);
  return new Blob([head, json, ...parts], { type: "application/octet-stream" });
}

const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;

/** Reads a backup file. Throws BackupError with a message for the person if it is not a good backup. */
export async function unpackBackup(file: Blob): Promise<BackupData> {
  if (file.size < 16) throw new BackupError("This is not a Waraqa backup file.");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new BackupError("This is not a Waraqa backup file.");
  const dv = new DataView(head.buffer);
  const version = dv.getUint32(8, true);
  if (version > FORMAT) throw new BackupError("This backup was made by a newer version of Waraqa. Update the app first.");
  const len = dv.getUint32(12, true);
  if (16 + len > file.size) throw new BackupError("The backup file is damaged (it is cut short).");

  let h: Header;
  try {
    h = JSON.parse(new TextDecoder().decode(await file.slice(16, 16 + len).arrayBuffer()));
  } catch {
    throw new BackupError("The backup file is damaged and cannot be read.");
  }
  if (!h || h.app !== "waraqa-scan" || !Array.isArray(h.docs) || !Array.isArray(h.pages) || !Array.isArray(h.folders ?? [])) {
    throw new BackupError("The backup file is damaged and cannot be read.");
  }

  const dataStart = 16 + len;
  const dataLen = file.size - dataStart;
  const docIds = new Set<string>();
  for (const d of h.docs) {
    if (!d || !isStr(d.id) || typeof d.name !== "string" || !Array.isArray(d.pageIds)) throw new BackupError("The backup file is damaged (a document is incomplete).");
    docIds.add(d.id);
  }
  const blob = (r: BlobRef) => {
    if (!r || !Number.isInteger(r.o) || !Number.isInteger(r.l) || r.o < 0 || r.l < 0 || r.o + r.l > dataLen) {
      throw new BackupError("The backup file is damaged (a page image is missing).");
    }
    return file.slice(dataStart + r.o, dataStart + r.o + r.l, r.t || "image/jpeg");
  };
  const pages: PageRec[] = h.pages.map((p) => {
    if (!p || !isStr(p.id) || !docIds.has(p.docId)) throw new BackupError("The backup file is damaged (a page has no document).");
    return { ...p, original: blob(p.original), result: blob(p.result) };
  });
  return { createdAt: Number(h.createdAt) || 0, docs: h.docs, folders: h.folders ?? [], pages };
}

export interface RestorePlan {
  docs: DocRec[];
  folders: FolderRec[];
  pages: PageRec[];
  /** Documents already on the phone exactly as in the backup. */
  same: number;
  /** Documents on the phone that changed since the backup: the backup copy is added beside them. */
  copies: number;
}

/**
 * Decides what to write. Nothing on the phone is overwritten or deleted:
 * - a document not on the phone is added as it was;
 * - one on the phone with the same last change is left alone;
 * - one on the phone that changed since is added again as a copy, "(restored)".
 */
export function planRestore(
  backup: BackupData,
  existingDocs: Map<string, number>, // id -> updatedAt
  existingFolders: Set<string>,
  makeId: () => string,
): RestorePlan {
  const pagesByDoc = new Map<string, PageRec[]>();
  for (const p of backup.pages) {
    const list = pagesByDoc.get(p.docId) ?? [];
    list.push(p);
    pagesByDoc.set(p.docId, list);
  }
  const folders = backup.folders.filter((f) => f && isStr(f.id) && !existingFolders.has(f.id));
  const knownFolder = (id?: string) => !!id && (existingFolders.has(id) || backup.folders.some((f) => f?.id === id));
  const docs: DocRec[] = [];
  const pages: PageRec[] = [];
  let same = 0, copies = 0;
  for (const src of backup.docs) {
    // A document whose folder is gone goes back to the top level, so it is never hidden.
    const d = knownFolder(src.folderId) ? src : { ...src, folderId: undefined };
    const own = (pagesByDoc.get(d.id) ?? []).filter((p) => d.pageIds.includes(p.id));
    const kept = d.pageIds.filter((id) => own.some((p) => p.id === id));
    const there = existingDocs.get(d.id);
    if (there === undefined) {
      docs.push({ ...d, pageIds: kept });
      pages.push(...own);
    } else if (there === d.updatedAt) {
      same++;
    } else {
      copies++;
      const docId = makeId();
      const idMap = new Map(own.map((p) => [p.id, makeId()]));
      docs.push({ ...d, id: docId, name: d.name + " (restored)", pageIds: kept.map((id) => idMap.get(id)!), sample: undefined });
      pages.push(...own.map((p) => ({ ...p, id: idMap.get(p.id)!, docId })));
    }
  }
  return { docs, folders, pages, same, copies };
}

export function backupName(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `waraqa-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}${BACKUP_EXT}`;
}
