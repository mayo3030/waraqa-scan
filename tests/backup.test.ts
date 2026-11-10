// Backup files round-trip, damaged files are refused, and restore never overwrites.
import { BackupError, backupName, packBackup, planRestore, unpackBackup } from "../src/lib/backup";
import type { DocRec, FolderRec, PageRec } from "../src/lib/store";

let bad = 0;
const check = (name: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL", name); } };

const bytes = (n: number, seed: number) => new Uint8Array(n).map((_, i) => (i * 31 + seed) & 255);
const page = (id: string, docId: string, seed: number): PageRec => ({
  id, docId,
  original: new Blob([bytes(5000 + seed, seed)], { type: "image/jpeg" }),
  result: new Blob([bytes(3000 + seed, seed + 1)], { type: "image/jpeg" }),
  quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  rotation: 1, filter: "clean" as any, adjust: { brightness: 0, contrast: 0 } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  thumb: "data:image/jpeg;base64,AAAA", width: 100, height: 140,
});
const docs: DocRec[] = [
  { id: "d1", name: "عقد الإيجار", createdAt: 1, updatedAt: 10, pageIds: ["p1", "p2"], text: "rent عقد", folderId: "f1", tags: ["Contract"] },
  { id: "d2", name: "Receipt 😀", createdAt: 2, updatedAt: 20, pageIds: ["p3"] },
];
const folders: FolderRec[] = [{ id: "f1", name: "Home", createdAt: 1 }];
const pages = [page("p1", "d1", 1), page("p2", "d1", 2), page("p3", "d2", 3)];

// Round trip
const file = await packBackup({ docs, folders, pages }, 1234);
const back = await unpackBackup(file);
check("createdAt kept", back.createdAt === 1234);
check("docs kept", JSON.stringify(back.docs) === JSON.stringify(docs));
check("folders kept", back.folders.length === 1 && back.folders[0].name === "Home");
check("pages kept", back.pages.length === 3 && back.pages[1].id === "p2" && back.pages[1].rotation === 1);
for (let i = 0; i < pages.length; i++) {
  const a = new Uint8Array(await pages[i].original.arrayBuffer());
  const b = new Uint8Array(await back.pages[i].original.arrayBuffer());
  const c = new Uint8Array(await pages[i].result.arrayBuffer());
  const d = new Uint8Array(await back.pages[i].result.arrayBuffer());
  check(`page ${i} photo bytes`, a.length === b.length && a.every((x, j) => x === b[j]));
  check(`page ${i} result bytes`, c.length === d.length && c.every((x, j) => x === d[j]));
  check(`page ${i} type`, back.pages[i].result.type === "image/jpeg");
}

// Damaged files
const refuses = async (name: string, f: Blob) => {
  try { await unpackBackup(f); check(name + " refused", false); }
  catch (e) { check(name + " gives a message", e instanceof BackupError && e.message.length > 10); }
};
await refuses("empty file", new Blob([]));
await refuses("a JPEG", new Blob([bytes(4000, 9)]));
await refuses("cut short", file.slice(0, file.size - 100));
await refuses("cut in the header", file.slice(0, 40));
const raw = new Uint8Array(await file.arrayBuffer());
const broken = raw.slice(); broken[20] = 0x7b; broken[21] = 0x7b;
await refuses("broken header", new Blob([broken]));
const newer = raw.slice(); new DataView(newer.buffer).setUint32(8, 99, true);
await refuses("newer format", new Blob([newer]));

// Restore plan: empty phone gets everything
let n = 0;
const ids = () => "new" + ++n;
const all = planRestore(back, new Map(), new Set(), ids);
check("empty phone: all docs", all.docs.length === 2 && all.pages.length === 3 && all.folders.length === 1);
check("empty phone: ids kept", all.docs[0].id === "d1" && all.pages[0].id === "p1");

// Same doc already there: skipped. Changed doc: added as a copy with fresh ids.
const plan = planRestore(back, new Map([["d1", 10], ["d2", 99]]), new Set(["f1"]), ids);
check("same doc skipped", plan.same === 1);
check("changed doc copied", plan.copies === 1 && plan.docs.length === 1);
const copy = plan.docs[0];
check("copy has new id", copy.id !== "d2" && copy.name === "Receipt 😀 (restored)");
check("copy pages point at copy", plan.pages.length === 1 && plan.pages[0].docId === copy.id && copy.pageIds[0] === plan.pages[0].id && plan.pages[0].id !== "p3");
check("folder not duplicated", plan.folders.length === 0);

// A document in a folder that no longer exists goes to the top level
const lost = planRestore({ ...back, folders: [] }, new Map(), new Set(), ids);
check("lost folder cleared", lost.docs[0].folderId === undefined);

// A page listed in a doc but missing from the file is dropped, not left dangling
const gap = planRestore({ ...back, pages: back.pages.filter((p) => p.id !== "p2") }, new Map(), new Set(), ids);
check("missing page dropped", JSON.stringify(gap.docs[0].pageIds) === '["p1"]');

check("file name", /^waraqa-backup-2026-03-05\.waraqa$/.test(backupName(new Date(2026, 2, 5))));

if (bad) { console.log(bad + " backup checks failed"); process.exit(1); }
console.log("backup: all checks passed");
