// Small settings kept in localStorage.
import { useState } from "react";
import type { PaperSize } from "./pdf";

export interface Prefs {
  paper: PaperSize;
  hd: boolean; // bigger photos and pages
  grid: boolean; // grid lines on the camera
  location: boolean; // add place to timestamp photos
}

const DEFAULTS: Prefs = { paper: "letter", hd: false, grid: false, location: false };
const KEY = "waraqa-prefs";

export function readPrefs(): Prefs {
  try {
    const old = localStorage.getItem("waraqa-paper") as PaperSize | null;
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...(old ? { paper: old } : {}), ...v };
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem("waraqa-paper", p.paper);
  } catch { /* ignore */ }
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [p, setP] = useState(readPrefs);
  return [p, (patch) => setP((cur) => { const n = { ...cur, ...patch }; writePrefs(n); return n; })];
}
