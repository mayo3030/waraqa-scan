import { useCallback, useEffect, useRef, useState } from "react";
import * as I from "../icons";
import type { Toast } from "../App";
import { MODES, modeInfo, type Mode } from "../lib/modes";
import type { Prefs } from "../lib/prefs";
import { currentPlace, stampLines } from "../lib/stamp";
import { readCode, readCodeFromImage } from "../lib/qr";
import { CodeResult } from "./CodeResult";

export interface Shots { blobs: Blob[]; mode: Mode; stamps?: string[][] }

interface Props {
  mode: Mode;
  adding: boolean; // adding pages to an open document
  prefs: Prefs;
  setPrefs(p: Partial<Prefs>): void;
  notify(t: Toast): void;
  onClose(): void;
  onShots(s: Shots): void;
  onAllTools(): void;
}

interface Shot { blob: Blob; url: string; stamp?: string[] }

/**
 * Live camera with the scan modes along the bottom. When the live camera is
 * not available (no permission, old WebView) the shutter opens the phone's
 * own camera app instead.
 */
export function CameraScreen({ mode: startMode, adding, prefs, setPrefs, notify, onClose, onShots, onAllTools }: Props) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [batch, setBatch] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [live, setLive] = useState<"starting" | "on" | "off">("starting");
  const [torch, setTorch] = useState<boolean | null>(null); // null: no torch on this camera
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [flashFx, setFlashFx] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const place = useRef<{ lat: number; lon: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const info = modeInfo(mode);
  const multi = info.shots === "two" || mode === "mega" || (info.shots === "many" && batch);

  // Start (and restart on HD change) the back camera.
  useEffect(() => {
    let stop = false;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) { setLive("off"); return; }
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
  }, [prefs.hd]);

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
        if (text && !stop) { setCode(text); return; }
      }
      timer = window.setTimeout(tick, 280);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [mode, live, code]);

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
    onShots({ blobs: list.map((s) => s.blob), mode, stamps: mode === "timestamp" ? list.map((s) => s.stamp ?? []) : undefined });
  }, [mode, onShots]);

  const addShots = (blobs: Blob[]) => {
    const made = blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob), stamp: stampNow() }));
    const next = [...shots, ...made];
    if (info.shots === "one" || (!multi && info.shots === "many") || (info.shots === "two" && next.length >= 2)) {
      finish(next);
      return;
    }
    setShots(next);
  };

  const capture = async () => {
    const v = video.current;
    if (!v || live !== "on" || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlashFx(true);
    setTimeout(() => setFlashFx(false), 120);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
    if (blob) addShots([blob]);
  };

  const fromFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || !f.type);
    e.target.value = "";
    if (!files.length) return;
    if (mode === "code") {
      const text = await readCodeFromImage(files[0]).catch(() => null);
      if (text) setCode(text);
      else notify({ text: "No QR code was found in that photo", tone: "error" });
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
  };

  const prompt =
    mode === "idcard" ? (shots.length ? "Now the back of the card" : "Front of the card inside the frame") :
    mode === "mega" ? (shots.length ? `Part ${shots.length + 1}: move down, keep some overlap` : "Start at the top of the page") :
    mode === "book" ? "Spine on the middle line" :
    mode === "idphoto" ? "Face inside the oval, plain wall behind" :
    mode === "code" ? "Point at a QR code" : null;

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
        </div>
        <button className="cam-btn" onClick={() => setMenu(true)} aria-label="More"><I.Dots /></button>
      </header>

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
        {live === "on" && mode === "idcard" && <div className="guide guide-card" aria-hidden="true" />}
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
          ) : (
            <label className="cam-btn cam-import" htmlFor="cam-import" aria-label="Import images">
              <input id="cam-import" className="file-input" type="file" accept="image/*" multiple={mode !== "code" && mode !== "idphoto"} onChange={fromFiles} />
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
          {shots.length > 0 && info.shots !== "two" ? (
            <button className="btn btn-primary cam-done" onClick={() => finish(shots)}>
              <I.Check /> Done
            </button>
          ) : info.shots === "many" && mode !== "mega" ? (
            <div className="cam-seg" role="radiogroup" aria-label="Pages">
              <button role="radio" aria-checked={!batch} className={!batch ? "on" : ""} onClick={() => setBatch(false)}>Single</button>
              <button role="radio" aria-checked={batch} className={batch ? "on" : ""} onClick={() => setBatch(true)}>Batch</button>
            </div>
          ) : null}
        </div>
      </footer>

      {(menu || help) && (
        <div className="scrim" onClick={() => { setMenu(false); setHelp(false); }}>
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
                  <h2>Camera</h2>
                  <button className="icon-btn" onClick={() => setMenu(false)} aria-label="Close"><I.Close /></button>
                </div>
                <label className="switch-row">
                  <span><I.Grid /> Grid lines</span>
                  <input type="checkbox" checked={prefs.grid} onChange={(e) => setPrefs({ grid: e.target.checked })} />
                </label>
                <label className="switch-row">
                  <span><I.Stamp /> Add location to timestamps</span>
                  <input type="checkbox" checked={prefs.location} onChange={(e) => setPrefs({ location: e.target.checked })} />
                </label>
                <label className="switch-row">
                  <span><span className="hd-mini">HD</span> High resolution pages</span>
                  <input type="checkbox" checked={prefs.hd} onChange={(e) => setPrefs({ hd: e.target.checked })} />
                </label>
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

      {code !== null && <CodeResult text={code} notify={notify} onAgain={() => setCode(null)} onClose={onClose} />}
    </div>
  );
}
