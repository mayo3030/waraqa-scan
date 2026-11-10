// API keys the user pastes in Settings. On the phone they are encrypted with
// a key held by the Android Keystore; they are never part of the app itself.
import { Capacitor, registerPlugin } from "@capacitor/core";

export type SecretName = "openrouter" | "replicate";

const Device = registerPlugin<{
  setSecret(o: { name: string; value: string }): Promise<void>;
  getSecret(o: { name: string }): Promise<{ value: string | null }>;
  removeSecret(o: { name: string }): Promise<void>;
}>("Device");

const native = () => Capacitor.isNativePlatform();
const webKey = (n: SecretName) => "waraqa-key-" + n;

/** True where keys are stored encrypted (the Android app). */
export const encryptedStorage = native;

export async function getSecret(name: SecretName): Promise<string | null> {
  try {
    if (native()) return (await Device.getSecret({ name })).value || null;
    return localStorage.getItem(webKey(name)) || null;
  } catch {
    return null;
  }
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  const v = value.trim();
  if (!v) return clearSecret(name);
  if (native()) await Device.setSecret({ name, value: v });
  else localStorage.setItem(webKey(name), v);
}

export async function clearSecret(name: SecretName): Promise<void> {
  try {
    if (native()) await Device.removeSecret({ name });
    else localStorage.removeItem(webKey(name));
  } catch { /* nothing saved */ }
}

/** "••••1a2b" for a saved key, null when none. Never returns the whole key. */
export async function secretHint(name: SecretName): Promise<string | null> {
  const v = await getSecret(name);
  return v ? "••••" + v.slice(-4) : null;
}
