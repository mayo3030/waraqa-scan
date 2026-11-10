import { useEffect, useState } from "react";
import * as I from "../icons";
import { PAPER } from "../lib/pdf";
import type { Prefs } from "../lib/prefs";
import { UpdateButton } from "./UpdateButton";
import { canUpdate } from "../lib/updater";
import { memoryOnly } from "../lib/store";
import { CameraSettings, ScanSettings } from "./ScanSettings";
import { AiKeys } from "./AiKeys";
import { BackupSection } from "./Backup";

interface Props {
  prefs: Prefs;
  setPrefs(p: Partial<Prefs>): void;
  docCount: number;
  notify(t: { text: string; tone?: "error" }): void;
  onChanged(): void;
}

/** The "Me" tab: app version and updates, defaults, storage. */
export function Settings({ prefs, setPrefs, docCount, notify, onChanged }: Props) {
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setSpace({ used: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {});
  }, []);
  const mb = (n: number) => (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1) + " MB";

  return (
    <>
      <header className="bar">
        <h1 className="bar-title">Me</h1>
        <UpdateButton />
      </header>
      <main className="page">
        <section className="me-card">
          <I.Mark size={44} />
          <div>
            <b>Waraqa Scan</b>
            <p className="muted small">Version {__APP_VERSION__}{canUpdate() ? ". Tap the arrows above to check for an update." : ""}</p>
          </div>
        </section>

        <section className="set-group">
          <h2>Defaults</h2>
          <div className="set-row">
            <span>PDF paper size</span>
            <div className="seg seg-sm" role="radiogroup" aria-label="Paper size">
              {PAPER.map((p) => (
                <button key={p.id} role="radio" aria-checked={prefs.paper === p.id} className={prefs.paper === p.id ? "on" : ""} onClick={() => setPrefs({ paper: p.id })}>{p.label}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="set-group">
          <h2>Scan settings</h2>
          <ScanSettings prefs={prefs} setPrefs={setPrefs} />
        </section>

        <section className="set-group">
          <h2>Camera</h2>
          <CameraSettings prefs={prefs} setPrefs={setPrefs} />
        </section>

        <section className="set-group">
          <h2>AI keys</h2>
          <AiKeys />
        </section>

        <section className="set-group">
          <h2>Backup</h2>
          <BackupSection docCount={docCount} notify={notify} onChanged={onChanged} />
        </section>

        <section className="set-group">
          <h2>Storage</h2>
          <p className="muted">
            {docCount} {docCount === 1 ? "document" : "documents"}
            {space && space.used > 0 ? `, using ${mb(space.used)} on this phone` : ""}.
          </p>
          {memoryOnly && <p className="note">This view cannot keep files, so scans are lost when it closes.</p>}
          <p className="muted small">Your scans, signatures and read text stay on this phone. Nothing is uploaded, unless you choose Open in Google Translate or one of the AI features.</p>
        </section>
      </main>
    </>
  );
}
