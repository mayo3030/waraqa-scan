// Documents and pages kept on the device in IndexedDB.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Quad } from "./geometry";
import type { Adjust, FilterKind } from "./filters";

export interface DocRec {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageIds: string[];
  text?: string; // extracted text, used by search
  sample?: boolean;
  folderId?: string; // missing = top level
  tags?: string[]; // e.g. "ID Card", "Receipt"
}

export interface FolderRec {
  id: string;
  name: string;
  createdAt: number;
}

export const TAGS = ["ID Card", "Receipt", "Business Card", "Note", "Book", "Whiteboard", "Slides", "Contract", "Photo", "Formula", "Questions", "Count", "Card"] as const;

export interface PageRec {
  id: string;
  docId: string;
  original: Blob; // the photo as taken (downscaled)
  quad: Quad;
  rotation: number; // quarter turns clockwise
  filter: FilterKind;
  adjust: Adjust;
  result: Blob; // flattened, filtered JPEG
  thumb: string; // small JPEG data URL
  width: number;
  height: number;
}

interface Schema extends DBSchema {
  docs: { key: string; value: DocRec };
  pages: { key: string; value: PageRec; indexes: { byDoc: string } };
  folders: { key: string; value: FolderRec };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function openReal() {
  const open = openDB<Schema>("waraqa-scan", 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("docs", { keyPath: "id" });
        d.createObjectStore("pages", { keyPath: "id" }).createIndex("byDoc", "docId");
      }
      if (oldVersion < 2) d.createObjectStore("folders", { keyPath: "id" });
    },
  });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("storage timeout")), 4000));
  return Promise.race([open, timeout]);
}

/** True when pages can only be kept until the page is closed. */
export let memoryOnly = false;

// Minimal in-memory stand-in with the few calls this file uses.
function memoryDb(): IDBPDatabase<Schema> {
  const stores: Record<string, Map<string, any>> = { docs: new Map(), pages: new Map(), folders: new Map() };
  const store = (name: string) => ({
    get: async (k: string) => stores[name].get(k),
    getAll: async () => [...stores[name].values()],
    put: async (v: any) => { stores[name].set(v.id, v); },
    delete: async (k: string) => { stores[name].delete(k); },
    index: () => ({ getAllKeys: async (docId: string) => [...stores[name].values()].filter((p) => p.docId === docId).map((p) => p.id) }),
  });
  const api: any = {
    get: (n: string, k: string) => store(n).get(k),
    getAll: (n: string) => store(n).getAll(),
    put: (n: string, v: any) => store(n).put(v),
    delete: (n: string, k: string) => store(n).delete(k),
    transaction: () => ({ objectStore: (n: string) => store(n), done: Promise.resolve() }),
  };
  return api;
}

function db() {
  dbp ??= openReal().catch(() => {
    memoryOnly = true;
    return memoryDb();
  });
  return dbp;
}

export const newId = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function listDocs(): Promise<DocRec[]> {
  const all = await (await db()).getAll("docs");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string) {
  return (await db()).get("docs", id);
}

export async function putDoc(d: DocRec) {
  await (await db()).put("docs", d);
}

export async function getPage(id: string) {
  return (await db()).get("pages", id);
}

export async function getPages(doc: DocRec): Promise<PageRec[]> {
  const d = await db();
  const pages = await Promise.all(doc.pageIds.map((id) => d.get("pages", id)));
  return pages.filter(Boolean) as PageRec[];
}

export async function savePage(p: PageRec) {
  const d = await db();
  const tx = d.transaction(["docs", "pages"], "readwrite");
  await tx.objectStore("pages").put(p);
  const doc = await tx.objectStore("docs").get(p.docId);
  if (doc) {
    if (!doc.pageIds.includes(p.id)) doc.pageIds.push(p.id);
    doc.updatedAt = Date.now();
    await tx.objectStore("docs").put(doc);
  }
  await tx.done;
}

export async function deletePage(docId: string, pageId: string) {
  const d = await db();
  const tx = d.transaction(["docs", "pages"], "readwrite");
  await tx.objectStore("pages").delete(pageId);
  const doc = await tx.objectStore("docs").get(docId);
  if (doc) {
    doc.pageIds = doc.pageIds.filter((x) => x !== pageId);
    doc.updatedAt = Date.now();
    await tx.objectStore("docs").put(doc);
  }
  await tx.done;
}

export async function deleteDoc(id: string) {
  const d = await db();
  const tx = d.transaction(["docs", "pages"], "readwrite");
  const keys = await tx.objectStore("pages").index("byDoc").getAllKeys(id);
  for (const k of keys) await tx.objectStore("pages").delete(k);
  await tx.objectStore("docs").delete(id);
  await tx.done;
}

export function defaultName(now = new Date()) {
  const d = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const t = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Scan ${d}, ${t}`;
}

// ---- Folders ----

export async function listFolders(): Promise<FolderRec[]> {
  const all = await (await db()).getAll("folders");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putFolder(f: FolderRec) {
  await (await db()).put("folders", f);
}

/** Removes the folder; its documents move back to the top level. */
export async function deleteFolder(id: string) {
  const d = await db();
  for (const doc of await d.getAll("docs")) {
    if (doc.folderId === id) await d.put("docs", { ...doc, folderId: undefined });
  }
  await d.delete("folders", id);
}

// ---- Page helpers used by the tools ----

/** Saves new pages (already built) at the end of a document, in order. */
export async function addPages(docId: string, pages: Omit<PageRec, "id" | "docId">[]) {
  for (const p of pages) await savePage({ ...p, id: newId(), docId });
}

/** Copies pages into another document (merge files, extract pages). */
export async function copyPages(pages: PageRec[], docId: string) {
  for (const p of pages) await savePage({ ...p, id: newId(), docId });
}

/** Replaces a page's finished image, keeping its photo and settings. */
export async function replaceResult(page: PageRec, result: Blob, thumb: string, width: number, height: number) {
  await savePage({ ...page, result, thumb, width, height });
}

export async function newDoc(name: string, extra: Partial<DocRec> = {}): Promise<DocRec> {
  const now = Date.now();
  const doc: DocRec = { id: newId(), name, createdAt: now, updatedAt: now, pageIds: [], ...extra };
  await putDoc(doc);
  return doc;
}

/** Puts a page at a new index inside its document. */
export async function setPageOrder(doc: DocRec, pageIds: string[]) {
  await putDoc({ ...doc, pageIds, updatedAt: Date.now() });
}
