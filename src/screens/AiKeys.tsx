import { useEffect, useState } from "react";
import { clearSecret, encryptedStorage, secretHint, setSecret, type SecretName } from "../lib/secrets";

const KEYS: { name: SecretName; label: string; uses: string; hint: string }[] = [
  { name: "openrouter", label: "OpenRouter API key", uses: "Formula to LaTeX and AI Chat", hint: "sk-or-…" },
  { name: "replicate", label: "Replicate API token", uses: "AI Restore and AI Colorize", hint: "r8_…" },
];

/** Two key fields. The saved key is never shown again, only its last 4 characters. */
export function AiKeys() {
  return (
    <>
      {KEYS.map((k) => <KeyField key={k.name} {...k} />)}
      <p className="muted small">
        {encryptedStorage()
          ? "Keys are encrypted on this phone and are never part of the app. "
          : "In this browser view keys are kept in the browser without encryption. Use the phone app for real keys. "}
        These features send the page you pick to that service, and each use spends your credit there.
      </p>
    </>
  );
}

function KeyField({ name, label, uses, hint }: { name: SecretName; label: string; uses: string; hint: string }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { void secretHint(name).then(setSaved); }, [name]);

  const save = async () => {
    try {
      await setSecret(name, value);
      setValue("");
      setEditing(false);
      setSaved(await secretHint(name));
      setMsg("Saved");
    } catch {
      setMsg("The key could not be saved on this phone");
    }
  };
  const clear = async () => {
    await clearSecret(name);
    setSaved(null);
    setEditing(false);
    setValue("");
    setMsg("Removed");
  };

  return (
    <div className="set-row key-row">
      <span>{label}<small className="muted"> · {uses}</small></span>
      {saved && !editing ? (
        <div className="key-saved">
          <code dir="ltr">{saved}</code>
          <button className="btn btn-quiet" onClick={() => { setEditing(true); setMsg(""); }}>Replace</button>
          <button className="btn btn-quiet" onClick={clear}>Clear</button>
        </div>
      ) : (
        <form className="key-edit" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void save(); }}>
          <input className="field" type="password" dir="ltr" autoComplete="off" autoCapitalize="off" spellCheck={false}
            placeholder={hint} value={value} onChange={(e) => setValue(e.target.value)} aria-label={label} />
          <button className="btn btn-primary" type="submit" disabled={!value.trim()}>Save</button>
          {saved && <button className="btn btn-quiet" type="button" onClick={() => { setEditing(false); setValue(""); }}>Cancel</button>}
        </form>
      )}
      {msg && <small className="muted" role="status">{msg}</small>}
    </div>
  );
}
