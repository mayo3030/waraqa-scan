// Small settings kept in localStorage.
import { useState } from "react";
import type { PaperSize } from "./pdf";
import type { Orientation } from "./device";

export interface Prefs {
  paper: PaperSize;
  hd: boolean; // bigger photos and pages
  grid: boolean; // grid lines on the camera
  location: boolean; // add place to timestamp photos
  // camera settings
  orientation: Orientation;
  sound: boolean; // shutter click
  level: boolean; // spirit level on the camera
  outline: boolean; // page edges drawn live on the camera
  // scan settings
  autoBorders: boolean; // find the page edges by itself
  adjustEach: boolean; // show corners and filters after each photo
  startCamera: boolean; // open the camera when the app starts
  systemCamera: boolean; // use the phone's own camera app
  showImport: boolean; // import button on the camera
  saveToGallery: boolean; // keep each photo in the gallery too
  doubleFocus: boolean; // focus again right before the photo
  translateTo: string; // language code for Translate
}

const DEFAULTS: Prefs = {
  paper: "letter", hd: false, grid: false, location: false,
  orientation: "auto", sound: true, level: false, outline: true,
  autoBorders: true, adjustEach: true, startCamera: false, systemCamera: false, showImport: true, saveToGallery: false, doubleFocus: false,
  translateTo: "ar",
};
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
