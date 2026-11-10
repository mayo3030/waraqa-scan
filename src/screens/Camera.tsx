import { useCallback, useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import { ID_PRESETS, idPreset, MODES, modeInfo, type IdPreset, type Mode, type ModeOpts } from "../lib/modes";
import type { Prefs } from "../lib/prefs";
import { currentPlace, stampLines } from "../lib/stamp";
import { readCode, readCodeFromImage } from "../lib/qr";
import { saveToGallery, shutterClick } from "../lib/device";
import { TARGETS } from "../lib/translate";
import { CodeResult } from "./CodeResult";
import { FeatureSheet } from "./Features";
import { CameraSettings, ScanSettings } from "./ScanSettings";
import type { DocTool } from "./DocView";

export interface Shots { blobs: Blob[]; mode: Mode; stamps?: string[][]; opts?: ModeOpts }

const HISTORY = "waraqa-codes";
type CodeItem = { text: string; at: number };
function readHistory(): CodeItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY) || "[]"); } catch { return []; }
}
function remember(text: string) {
  try {
    const list = [{ text, at: Date.now() }, ...readHistory().filter((x) => x.text !== text)].slice(0, 50);
    localStorage.setItem(HISTORY, JSON.stringify(list));
  } catch { /* storage full */ }
}

interface Props {
  mode: Mode;
  adding: boolean; // adding pages to an open document
  prefs: Prefs;
  setPrefs(p: Partial<Prefs>): void;
  notify(t: Toast): void;
  onClose(): void;
  onShots(s: Shots): void;
  onAllTools(): void;
  onDocTool(t: DocTool): void;
}

interface Shot { blob: Blob; url: string; stamp?: string[] }

/**
 * Live camera with the scan modes along the bottom. When the live camera is
 * not available (no permission, old WebView) the shutter opens the phone's
 * own camera app instead.
 */
export function CameraScreen({ mode: startMode, adding, prefs, setPrefs, notify, onClose, onShots, onAllTools, onDocTool }: Props) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [batch, setBatch] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [torch, setTorch] = useState<boolean | null>(null); // null: no torch on this camera
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [flashFx, setFlashFx] = useState(false);
  const [features, setFeatures] = useState(false);
  const [scanSet, setScanSet] = useState(false);
  const [history, setHistory] = useState<CodeItem[] | null>(null);
  const [intro, setIntro] = useState(startMode === "idcard" || startMode === "formula");
  const [preset, setPreset] = useState<IdPreset>("general");
  const [watermark, setWatermark] = useState("");
  const [idPaper, setIdPaper] = useState<"a4" | "letter">("a4");
  const [restoreKind, setRestoreKind] = useState<"restore" | "colorize">("restore");
  const [aiOn, setAiOn] = useState(false);
  const [auto, setAuto] = useState(false); // book: take a photo after each page turn
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const place = useRef<{ lat: number; lon: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const info = modeInfo(mode);
  const need = mode === "idcard" ? idPreset(preset).sides : info.shots === "two" ? 2 : info.shots === "one" ? 1 : 0; // 0: any number
  const multi = need === 2 || mode === "mega" || (info.shots === "many" && (batch || auto));
  const opts: ModeOpts = { id: preset, watermark: watermark.trim() ? `For ${watermark.trim()} use only` : undefined, paper: idPaper, restore: restoreKind, ai: aiOn };

  // Start (and restart on HD change) the back camera.
  useEffect(() => {
    let stop = false;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia || prefs.systemCamera) { setLive("off"); return; }
    setLive("starting");
    md.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: prefs.hd ? 3840 : 1920 },
        height: { ideal: prefs.hd ? 2160 : 1080 },
      },
    }).then((s) => {
      if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const v = video.current;
      if (v) { v.srcObject = s; v.play().catch(() => {}); }
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setLive("on");
    }).catch(() => { if (!stop) setLive("off"); });
    return () => {
      stop = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [prefs.hd, prefs.systemCamera]);

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Location for timestamps, asked once when that mode is chosen with location on.
  useEffect(() => {
    if (mode === "timestamp" && prefs.location && !place.current) {
      currentPlace().then((p) => {
        place.current = p;
        if (!p) notify({ text: "Location is not available, only the time is added" });
      });
    }
  }, [mode, prefs.location, notify]);

  // Keep the chosen mode in view in the strip.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(".mode.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [mode]);

  // Live QR reading.
  useEffect(() => {
    if (mode !== "code" || live !== "on" || code) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      if (stop) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        const text = await readCode(v).catch(() => null);
        if (text && !stop) { remember(text); setCode(text); return; }
      }
      timer = window.setTimeout(tick, 280);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [mode, live, code]);

  // Spirit level: phone flat over the page means both angles near 0.
  useEffect(() => {
    if (!prefs.level || live !== "on") { setTilt(null); return; }
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      setTilt({ x: Math.max(-30, Math.min(30, e.gamma)), y: Math.max(-30, Math.min(30, e.beta)) });
    };
    window.addEventListener("deviceorientation", on);
    return () => window.removeEventListener("deviceorientation", on);
  }, [prefs.level, live]);

  // Book auto-capture: watch a tiny copy of the picture; after it moves
  // (a page turn) and then holds still for a moment, take the photo.
  const captureRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!auto || mode !== "book" || live !== "on") return;
    const c = document.createElement("canvas");
    c.width = 48; c.height = 36;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let moved = true, stillSince = 0, lastShot = 0;
    const timer = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const cur = ctx.getImageData(0, 0, c.width, c.height).data;
      if (prev) {
        let diff = 0;
        for (let i = 0; i < cur.length; i += 4) diff += Math.abs(cur[i + 1] - prev[i + 1]);
        diff /= cur.length / 4;
        const now = Date.now();
        if (diff > 14) { moved = true; stillSince = 0; }
        else if (diff < 4) {
          if (!stillSince) stillSince = now;
          if (moved && now - stillSince > 900 && now - lastShot > 1500) {
            moved = false; lastShot = now;
            captureRef.current();
          }
        }
      }
      prev = cur;
    }, 150);
    return () => clearInterval(timer);
  }, [auto, mode, live]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      notify({ text: "The flash could not be turned on", tone: "error" });
    }
  };

  const stampNow = () => (mode === "timestamp" ? stampLines(new Date(), prefs.location ? place.current : null) : undefined);

  const finish = useCallback((list: Shot[]) => {
    if (!list.length) return;
    onShots({ blobs: list.map((s) => s.blob), mode, stamps: mode === "timestamp" ? list.map((s) => s.stamp ?? []) : undefined, opts });
  }, [mode, onShots, opts.id, opts.watermark, opts.paper, opts.restore, opts.ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const addShots = (blobs: Blob[]) => {
    const made = blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob), stamp: stampNow() }));
    const next = [...shots, ...made];
    if (need === 1 || (!multi && info.shots === "many") || (need === 2 && next.length >= 2)) {
      finish(next);
      return;
    }
    setShots(next);
  };

  const capture = async () => {
    const v = video.current;
    if (!v || live !== "on" || !v.videoWidth) return;
    if (prefs.doubleFocus) {
      const track = stream.current?.getVideoTracks()[0];
      const modes = ((track?.getCapabilities?.() ?? {}) as { focusMode?: string[] }).focusMode ?? [];
      if (track && modes.includes("single-shot")) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as MediaTrackConstraintSet] });
          await new Promise((r) => setTimeout(r, 450));
        } catch { /* keep going */ }
      }
    }
    if (prefs.sound) shutterClick();
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlashFx(true);
    setTimeout(() => setFlashFx(false), 120);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return;
    if (prefs.saveToGallery) saveToGallery(blob).then((ok) => { if (!ok) notify({ text: "This phone could not save the photo to the gallery" }); });
    addShots([blob]);
  };
  captureRef.current = capture;

  const fromFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || !f.type);
    e.target.value = "";
    if (!files.length) return;
    if (mode === "code") {
      const text = await readCodeFromImage(files[0]).catch(() => null);
      if (text) { remember(text); setCode(text); }
      else notify({ text: "No code was found in that photo", tone: "error" });
      return;
    }
    addShots(files);
  };

  const undo = () => {
    const last = shots[shots.length - 1];
    if (last) URL.revokeObjectURL(last.url);
    setShots(shots.slice(0, -1));
  };

  const pick = (m: Mode) => {
    if (shots.length && m !== mode) {
      notify({ text: "Finish or clear the photos you took before changing mode" });
      return;
    }
    setMode(m);
    setCode(null);
    setAuto(false);
    setFeatures(false);
    setIntro(m === "idcard" || m === "formula");
  };

  const prompt =
    intro ? null :
    mode === "idcard" ? (need === 1 ? "Photo page inside the frame" : shots.length ? "Now the back" : "Front side inside the frame") :
    mode === "formula" ? "Fit the formulas in the frame, you can crop next" :
    mode === "count" ? "Hold the phone above the objects" :
    mode === "book" && auto ? (shots.length ? `${shots.length} taken. Turn the page and hold still` : "Hold still on the first spread") :
    mode === "mega" ? (shots.length ? `Part ${shots.length + 1}: move down, keep some overlap` : "Start at the top of the page") :
    mode === "book" ? "Spine on the middle line" :
    mode === "idphoto" ? "Face inside the oval, plain wall behind" :
    mode === "code" ? "Point at a QR code or barcode" : null;
  const level = tilt && Math.abs(tilt.x) < 2.5 && Math.abs(tilt.y) < 2.5;

  return (
    <div className="camera">
      <header className="cam-bar">
        <button className="cam-btn" onClick={onClose} aria-label="Close camera"><I.Close /></button>
        <div className="cam-bar-mid">
          <button className="cam-btn" onClick={toggleTorch} disabled={torch === null} aria-label={torch ? "Flash off" : "Flash on"} aria-pressed={!!torch}>
            {torch ? <I.Flash /> : <I.FlashOff />}
          </button>
          <button className={"cam-btn cam-hd" + (prefs.hd ? " on" : "")} onClick={() => setPrefs({ hd: !prefs.hd })} aria-pressed={prefs.hd} aria-label="High resolution">HD</button>
          <button className="cam-btn" onClick={() => setHelp(true)} aria-label="How this mode works"><I.Help /></button>
          <button className="cam-btn" onClick={() => setFeatures(true)} aria-label="All features"><I.Apps /></button>
        </div>
        <button className="cam-btn" onClick={() => setMenu(true)} aria-label="Settings"><I.Dots /></button>
      </header>
      {mode === "translate" && (
        <div className="cam-lang">
          <span>Auto detect</span>
          <I.Right size={16} />
          <select aria-label="Translate to" value={prefs.translateTo} onChange={(e) => setPrefs({ translateTo: e.target.value })}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      )}

      <div className="cam-stage">
        {live !== "off" && <video ref={video} className="cam-video" playsInline muted autoPlay />}
        {live === "off" && (
          <div className="cam-off">
            <p>The live camera is not available here. Use your phone's camera instead.</p>
            <label className="btn btn-primary" htmlFor="cam-native">
              <input id="cam-native" className="file-input" type="file" accept="image/*" capture="environment" onChange={fromFiles} />
              <I.Camera /> Open camera
            </label>
          </div>
        )}
        {live === "on" && prefs.grid && <div className="cam-grid" aria-hidden="true" />}
        {live === "on" && mode === "idcard" && <div className={"guide " + (preset === "passport" ? "guide-passport" : "guide-card")} aria-hidden="true" />}
        {live === "on" && mode === "formula" && <div className="guide guide-formula" aria-hidden="true" />}
        {tilt && (
          <div className={"level" + (level ? " ok" : "")} aria-hidden="true">
            <span className="level-bubble" style={{ transform: `translate(${tilt.x * 1.6}px, ${tilt.y * 1.6}px)` }} />
          </div>
        )}
        {mode === "restore" && (
          <div className="cam-sub seg" role="radiogroup" aria-label="Restore or colorize">
            <button role="radio" aria-checked={restoreKind === "restore"} className={restoreKind === "restore" ? "on" : ""} onClick={() => setRestoreKind("restore")}>Restore</button>
            <button role="radio" aria-checked={restoreKind === "colorize"} className={restoreKind === "colorize" ? "on" : ""} onClick={() => setRestoreKind("colorize")}>Colorize</button>
            <button role="switch" aria-checked={aiOn} className={aiOn ? "on" : ""} onClick={() => { setAiOn(!aiOn); if (!aiOn) notify({ text: "AI uses your Replicate key and sends the photo online" }); }}>AI</button>
          </div>
        )}
        {mode === "book" && live === "on" && (
          <button className={"cam-sub cam-auto" + (auto ? " on" : "")} onClick={() => { setAuto(!auto); if (!auto) notify({ text: "Auto capture on: turn the page and hold still" }); }} aria-pressed={auto}>
            Auto capture {auto ? "on" : "off"}
          </button>
        )}
        {mode === "code" && (
          <button className="cam-sub cam-auto" onClick={() => setHistory(readHistory())}><I.History size={18} /> History</button>
        )}
        {intro && mode === "idcard" && (
          <div className="cam-intro" role="dialog" aria-label="ID cards">
            <div className="chips wrap" role="radiogroup" aria-label="Card type">
              {ID_PRESETS.map((p) => (
                <button key={p.id} role="radio" aria-checked={preset === p.id} className={"chip-btn" + (preset === p.id ? " on" : "")} onClick={() => setPreset(p.id)}>{p.label}</button>
              ))}
            </div>
            <IdSheetArt passport={preset === "passport"} mark={watermark.trim()} />
            <p className="small">{need === 1 ? "Take the photo page. It goes on one page at real size, ready to print." : "Take the front, then the back. Both sides go on one page at real size, ready to print."}</p>
            <label className="field-inline" htmlFor="id-wm">
              <span>For</span>
              <input id="id-wm" className="field" placeholder="bank, visa, rental" value={watermark} onChange={(e) => setWatermark(e.target.value)} />
              <span>use only</span>
            </label>
            <div className="seg seg-sm" role="radiogroup" aria-label="Paper">
              <button role="radio" aria-checked={idPaper === "a4"} className={idPaper === "a4" ? "on" : ""} onClick={() => setIdPaper("a4")}>A4</button>
              <button role="radio" aria-checked={idPaper === "letter"} className={idPaper === "letter" ? "on" : ""} onClick={() => setIdPaper("letter")}>Letter</button>
            </div>
            <button className="btn btn-primary wide" onClick={() => setIntro(false)}>Make it now</button>
          </div>
        )}
        {intro && mode === "formula" && (
          <div className="cam-intro" role="dialog" aria-label="Formula">
            <FormulaArt />
            <p className="small">Capture the page, crop to the formulas, then save them to Word as a picture with the text Waraqa could read. Editable equations need an online service, so they are not made here.</p>
            <button className="btn btn-primary wide" onClick={() => setIntro(false)}>Capture</button>
          </div>
        )}
        {live === "on" && mode === "idphoto" && <div className="guide guide-face" aria-hidden="true" />}
        {live === "on" && mode === "book" && <div className="guide guide-spine" aria-hidden="true" />}
        {live === "on" && mode === "code" && <div className="guide guide-code" aria-hidden="true" />}
        {prompt && live === "on" && <p className="cam-prompt">{prompt}</p>}
        {flashFx && <div className="cam-flash" aria-hidden="true" />}
      </div>

      <div className="cam-modes" ref={strip} role="tablist" aria-label="Scan mode">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={m.id === mode} className={"mode" + (m.id === mode ? " on" : "")} onClick={() => pick(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <footer className="cam-dock">
        <div className="cam-side">
          {shots.length > 0 ? (
            <button className="cam-thumb" onClick={undo} aria-label="Remove last photo">
              <img src={shots[shots.length - 1].url} alt="" />
              <span className="cam-count mono">{shots.length}</span>
            </button>
          ) : !prefs.showImport ? null : (
            <label className="cam-btn cam-import" htmlFor="cam-import" aria-label="Import images">
              <input id="cam-import" className="file-input" type="file" accept="image/*" multiple={need !== 1} onChange={fromFiles} />
              <I.Images />
              <span>Import</span>
            </label>
          )}
        </div>
        {mode !== "code" ? (
          live === "off" ? (
            <label className="shutter" htmlFor="cam-native-2" aria-label="Take photo">
              <input id="cam-native-2" className="file-input" type="file" accept="image/*" capture="environment" onChange={fromFiles} />
            </label>
          ) : (
            <button className="shutter" onClick={capture} disabled={live !== "on"} aria-label="Take photo" />
          )
        ) : <span className="shutter shutter-idle" aria-hidden="true"><I.Qr size={30} /></span>}
        <div className="cam-side cam-side-end">
          {shots.length > 0 && need !== 2 ? (
            <button className="btn btn-primary cam-done" onClick={() => finish(shots)}>
              <I.Check /> Done
            </button>
          ) : info.shots === "many" && mode !== "mega" && !auto ? (
            <div className="cam-seg" role="radiogroup" aria-label="Pages">
              <button role="radio" aria-checked={!batch} className={!batch ? "on" : ""} onClick={() => setBatch(false)}>Single</button>
              <button role="radio" aria-checked={batch} className={batch ? "on" : ""} onClick={() => setBatch(true)}>Batch</button>
            </div>
          ) : null}
        </div>
      </footer>

      {(menu || help) && (
        <div className="scrim" onClick={() => { setMenu(false); setHelp(false); setScanSet(false); }}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {help && (
              <>
                <div className="sheet-head">
                  <h2>{info.label}</h2>
                  <button className="icon-btn" onClick={() => setHelp(false)} aria-label="Close"><I.Close /></button>
                </div>
                <p className="muted">{info.help}</p>
                <button className="btn btn-quiet wide" onClick={() => setHelp(false)}>Got it</button>
              </>
            )}
            {menu && (
              <>
                <div className="sheet-head">
                  <h2>{scanSet ? "Scan settings" : "Camera settings"}</h2>
                  <button className="icon-btn" onClick={() => { setMenu(false); setScanSet(false); }} aria-label="Close"><I.Close /></button>
                </div>
                {scanSet ? <ScanSettings prefs={prefs} setPrefs={setPrefs} /> : <CameraSettings prefs={prefs} setPrefs={setPrefs} />}
                <button className="btn btn-quiet wide" onClick={() => setScanSet(!scanSet)}>
                  <I.Gear size={20} /> {scanSet ? "Camera settings" : "Scan settings"}
                </button>
                {!adding && (
                  <button className="btn btn-quiet wide" onClick={() => { setMenu(false); onAllTools(); }}>
                    <I.Tools size={20} /> All tools
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {history && (
        <div className="scrim" onClick={() => setHistory(null)}>
          <div className="sheet-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Scan history</h2>
              <button className="icon-btn" onClick={() => setHistory(null)} aria-label="Close"><I.Close /></button>
            </div>
            {!history.length && <p className="muted">Codes you scan show here.</p>}
            <ul className="code-history">
              {history.map((h) => (
                <li key={h.at}>
                  <button className="doc-row" onClick={() => { setHistory(null); setCode(h.text); }}>
                    <span className="doc-meta"><span className="doc-name" dir="auto">{h.text}</span><span className="doc-sub">{new Date(h.at).toLocaleString()}</span></span>
                    <I.Right />
                  </button>
                </li>
              ))}
            </ul>
            {history.length > 0 && (
              <button className="btn btn-quiet wide" onClick={() => { try { localStorage.removeItem(HISTORY); } catch { /* ignore */ } setHistory([]); }}>
                <I.Trash /> Clear history
              </button>
            )}
          </div>
        </div>
      )}

      {features && (
        <FeatureSheet
          onClose={() => setFeatures(false)}
          onMode={(m) => pick(m)}
          onDocTool={(t) => { setFeatures(false); onDocTool(t); }}
        />
      )}

      {code !== null && <CodeResult text={code} notify={notify} onAgain={() => setCode(null)} onClose={onClose} />}
    </div>
  );
}

/** Our own sketch of the ID sheet: a page with the card sides on it. */
function IdSheetArt({ passport, mark }: { passport: boolean; mark: string }) {
  return (
    <svg className="intro-art" viewBox="0 0 120 150" aria-hidden="true">
      <rect x="18" y="6" width="84" height="118" rx="3" fill="#fff" stroke="#c9cbe0" />
      {passport ? (
        <g><rect x="30" y="36" width="60" height="42" rx="3" fill="#dfe3f5" stroke="#3a3f8f" /><circle cx="44" cy="54" r="7" fill="#b8bfe6" /><path d="M56 50h26M56 57h20M36 70h46" stroke="#3a3f8f" strokeWidth="2" /></g>
      ) : (
        <g>
          <rect x="34" y="22" width="52" height="33" rx="4" fill="#dfe3f5" stroke="#3a3f8f" /><circle cx="46" cy="37" r="6" fill="#b8bfe6" /><path d="M56 33h24M56 40h18" stroke="#3a3f8f" strokeWidth="2" />
          <rect x="34" y="66" width="52" height="33" rx="4" fill="#eef0f8" stroke="#3a3f8f" /><path d="M34 74h52" stroke="#3a3f8f" strokeWidth="5" /><path d="M40 86h30M40 92h20" stroke="#3a3f8f" strokeWidth="2" />
        </g>
      )}
      {mark && <text x="60" y="68" fill="rgba(90,96,120,0.45)" fontSize="9" textAnchor="middle" transform="rotate(-30 60 68)">For {mark.slice(0, 14)} use only</text>}
      <text x="60" y="140" fill="#8a8fb0" fontSize="9" textAnchor="middle">{passport ? "Photo page on one sheet" : "Front and back on one page"}</text>
    </svg>
  );
}

function FormulaArt() {
  return (
    <svg className="intro-art" viewBox="0 0 120 110" aria-hidden="true">
      <rect x="16" y="6" width="88" height="98" rx="3" fill="#fff" stroke="#c9cbe0" />
      <path d="M26 20h50M26 28h64M26 36h40" stroke="#d6d8e8" strokeWidth="3" />
      <rect x="22" y="46" width="76" height="30" rx="3" fill="none" stroke="#f2b33d" strokeWidth="2.5" strokeDasharray="5 3" />
      <text x="60" y="66" fill="#3a3f8f" fontSize="11" textAnchor="middle" fontStyle="italic">x = (−b ± √Δ) / 2a</text>
      <path d="M26 88h56M26 96h30" stroke="#d6d8e8" strokeWidth="3" />
    </svg>
  );
}
