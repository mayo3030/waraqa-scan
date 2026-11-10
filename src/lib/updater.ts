// In-app updates for the Android build: reads the newest GitHub Release of
// this repo and installs its .apk over the running app.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface UpdaterPlugin {
  getVersion(): Promise<{ versionCode: number; versionName: string }>;
  fetchText(o: { url: string }): Promise<{ text: string }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(o: { url: string }): Promise<void>;
  addListener(e: "progress", cb: (p: { done: number; total: number }) => void): Promise<PluginListenerHandle>;
}

// Set only by the end-to-end test build (VITE_E2E=1): the update flow then runs in a
// browser against a stand-in, so the screens can be tested without a phone.
const E2E = import.meta.env?.VITE_E2E === "1";

function standIn(): UpdaterPlugin {
  const subs = new Set<(p: { done: number; total: number }) => void>();
  return {
    getVersion: async () => {
      // Tests can pretend to be another installed version.
      let v = "";
      try { v = localStorage.getItem("waraqa-e2e-version") ?? ""; } catch { /* ignore */ }
      return v ? { versionCode: buildOf(v.replace(/-test$/, "")), versionName: v } : { versionCode: 14, versionName: "1.2.14" };
    },
    fetchText: async ({ url }) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return { text: await r.text() };
    },
    canInstall: async () => ({ allowed: true }),
    openInstallSettings: async () => {},
    downloadAndInstall: async () => {
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 120));
        subs.forEach((cb) => cb({ done: i * 20, total: 100 }));
      }
    },
    addListener: async (_e, cb) => {
      subs.add(cb);
      return { remove: async () => { subs.delete(cb); } };
    },
  };
}

const Updater: UpdaterPlugin = E2E ? standIn() : registerPlugin<UpdaterPlugin>("Updater");

// Set by the GitHub build from the repository it runs in.
export const REPO: string = import.meta.env?.VITE_GH_REPO || "mayo3030/waraqa-scan";

export const canUpdate = () => E2E || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android");

export interface Release { build: number; name: string; apkUrl: string; notes: string }
export interface Check { current: { build: number; name: string }; latest: Release | null }

// Release tags look like v1.0.<build>; the build number is the Android versionCode.
export function buildOf(tag: string): number {
  const m = /(\d+)\s*$/.exec(tag);
  return m ? Number(m[1]) : 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRelease(r: any): Release | null {
  if (!r || r.draft) return null;
  const tag = String(r.tag_name ?? "");
  const apk = (r.assets ?? []).find((a: { name: string }) => String(a.name).toLowerCase().endsWith(".apk"));
  return apk ? { build: buildOf(tag.replace(/-test$/, "")), name: tag.replace(/^v/, ""), apkUrl: apk.browser_download_url, notes: r.body ?? "" } : null;
}

/**
 * The release this install should be offered. A normal install only follows normal releases.
 * A test install (version ends in "-test") follows test builds too, or it would never be
 * offered the next test build: GitHub's "latest release" leaves pre-releases out.
 */
export function pickRelease(releases: any[], currentName: string): Release | null {
  const tester = /-test$/.test(currentName);
  let best: Release | null = null;
  for (const r of releases) {
    if (!tester && r?.prerelease) continue;
    const rel = toRelease(r);
    if (rel && (!best || rel.build > best.build)) best = rel;
  }
  return best;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function checkForUpdate(): Promise<Check> {
  const v = await Updater.getVersion();
  const { text } = await Updater.fetchText({ url: `https://api.github.com/repos/${REPO}/releases?per_page=30` });
  const list = JSON.parse(text);
  const latest = pickRelease(Array.isArray(list) ? list : [list], v.versionName);
  return { current: { build: Number(v.versionCode), name: v.versionName }, latest };
}

export async function installUpdate(url: string, onProgress: (f: number) => void): Promise<"started" | "needs-permission"> {
  const { allowed } = await Updater.canInstall();
  if (!allowed) {
    await Updater.openInstallSettings();
    return "needs-permission";
  }
  const h = await Updater.addListener("progress", (p) => onProgress(p.total > 0 ? p.done / p.total : 0));
  try {
    await Updater.downloadAndInstall({ url });
  } finally {
    h.remove();
  }
  return "started";
}
