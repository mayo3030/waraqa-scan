import { useState } from "react";
import { BackupError, backupName, packBackup, planRestore, unpackBackup } from "../lib/backup";
import { dumpAll, listDocs, listFolders, newId, writeRestored } from "../lib/store";
import { saveFile } from "../lib/save";

interface Props {
  docCount: number;
  notify(t: { text: string; tone?: "error" }): void;
  onChanged(): void;
}

/** "Back up" writes one .waraqa file; "Restore" adds a backup's documents back. */
export function BackupSection({ docCount, notify, onChanged }: Props) {
  const [busy, setBusy] = useState<"" | "backup" | "restore">("");

  async function backup() {
    setBusy("backup");
    try {
      const all = await dumpAll();
      if (!all.docs.length) { notify({ text: "There are no documents to back up yet" }); return; }
      const file = await packBackup(all);
      const out = await saveFile(backupName(), file);
      if (out === "saved") notify({ text: `Backup ready: ${all.docs.length} ${all.docs.length === 1 ? "document" : "documents"}. Keep it in Drive or Files.` });
      else if (out === "unavailable") notify({ text: "The backup could not be saved", tone: "error" });
    } catch {
      notify({ text: "The backup could not be made", tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function restore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("restore");
    try {
      const data = await unpackBackup(file);
      const existing = new Map((await listDocs()).map((d) => [d.id, d.updatedAt]));
      const folders = new Set((await listFolders()).map((f) => f.id));
      const plan = planRestore(data, existing, folders, newId);
      if (plan.docs.length) await writeRestored(plan);
      onChanged();
      const bits = [`${plan.docs.length} ${plan.docs.length === 1 ? "document" : "documents"} restored`];
      if (plan.same) bits.push(`${plan.same} already on this phone`);
      if (plan.copies) bits.push(`${plan.copies} added as "(restored)" copies`);
      notify({ text: bits.join(", ") });
    } catch (err) {
      notify({ text: err instanceof BackupError ? err.message : "The backup could not be restored", tone: "error" });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <p className="muted small">
        Uninstalling the app deletes your scans. Make a backup file now and then, and keep it in Google Drive or Files.
      </p>
      <div className="set-row backup-row">
        <button className="btn btn-primary" onClick={backup} disabled={!!busy || !docCount}>
          {busy === "backup" ? "Making backup…" : "Back up all documents"}
        </button>
        <label className={"btn btn-quiet" + (busy ? " disabled" : "")} htmlFor="restore-file" aria-disabled={!!busy}>
          <input id="restore-file" className="file-input" type="file" onChange={restore} disabled={!!busy} />
          {busy === "restore" ? "Restoring…" : "Restore from a backup"}
        </label>
      </div>
      <p className="muted small">Restoring never deletes or replaces what is on this phone.</p>
    </>
  );
}
