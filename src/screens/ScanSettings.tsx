import * as I from "../icons";
import type { Prefs } from "../lib/prefs";
import type { Orientation } from "../lib/device";

type P = { prefs: Prefs; setPrefs(p: Partial<Prefs>): void };

const sw = (prefs: Prefs, setPrefs: P["setPrefs"], key: keyof Prefs, label: string, hint?: string, icon?: JSX.Element) => (
  <label className="switch-row" key={key}>
    <span className="switch-label">
      <span>{icon}{label}</span>
      {hint && <small className="muted">{hint}</small>}
    </span>
    <input type="checkbox" checked={!!prefs[key]} onChange={(e) => setPrefs({ [key]: e.target.checked } as Partial<Prefs>)} />
  </label>
);

/** Camera settings: orientation, grid, shutter sound, spirit level. */
export function CameraSettings({ prefs, setPrefs }: P) {
  const ORI: { id: Orientation; label: string }[] = [
    { id: "auto", label: "Auto" }, { id: "portrait", label: "Portrait" }, { id: "landscape", label: "Landscape" },
  ];
  return (
    <>
      <div className="field-col">
        <span>Orientation</span>
        <div className="seg" role="radiogroup" aria-label="Orientation">
          {ORI.map((o) => (
            <button key={o.id} role="radio" aria-checked={prefs.orientation === o.id} className={prefs.orientation === o.id ? "on" : ""} onClick={() => setPrefs({ orientation: o.id })}>{o.label}</button>
          ))}
        </div>
      </div>
      {sw(prefs, setPrefs, "grid", "Grid", undefined, <I.Grid size={18} />)}
      {sw(prefs, setPrefs, "sound", "Shutter sound")}
      {sw(prefs, setPrefs, "level", "Spirit level", "Shows a bubble so you can hold the phone flat over the page", <I.Level size={18} />)}
      {sw(prefs, setPrefs, "hd", "High resolution pages", "Sharper pages, bigger files")}
      {sw(prefs, setPrefs, "location", "Add location to timestamps")}
    </>
  );
}

/** Scan settings: how each photo is handled. */
export function ScanSettings({ prefs, setPrefs }: P) {
  return (
    <>
      {sw(prefs, setPrefs, "autoBorders", "Auto adjust borders", "Find the page edges by itself")}
      {sw(prefs, setPrefs, "adjustEach", "Adjust after each scan", "Show corners and filters after every photo. Off saves right away with the mode's filter.")}
      {sw(prefs, setPrefs, "startCamera", "Start with camera", "Open the camera when Waraqa starts")}
      {sw(prefs, setPrefs, "systemCamera", "Use system camera", "Take photos with your phone's camera app")}
      {sw(prefs, setPrefs, "showImport", "Import from gallery", "Show the Import button on the camera")}
      {sw(prefs, setPrefs, "saveToGallery", "Save scans to gallery", "Keep each photo in Pictures/Waraqa too (Android 10 and newer)")}
      {sw(prefs, setPrefs, "doubleFocus", "Double-focus", "Focus again right before each photo for sharper text")}
    </>
  );
}
