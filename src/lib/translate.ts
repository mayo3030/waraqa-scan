// Translate: on-device where the phone offers it, otherwise the user opens
// an online translator with the text.

export const TARGETS: { id: string; label: string }[] = [
  { id: "en", label: "English" }, { id: "ar", label: "Arabic" }, { id: "fr", label: "French" },
  { id: "es", label: "Spanish" }, { id: "de", label: "German" }, { id: "it", label: "Italian" },
  { id: "tr", label: "Turkish" }, { id: "ru", label: "Russian" }, { id: "pt", label: "Portuguese" },
  { id: "zh", label: "Chinese" }, { id: "ja", label: "Japanese" }, { id: "ko", label: "Korean" },
  { id: "hi", label: "Hindi" }, { id: "ur", label: "Urdu" }, { id: "fa", label: "Persian" },
];

export const targetLabel = (id: string) => TARGETS.find((t) => t.id === id)?.label ?? id;

/** Guess between Arabic and Latin text without any service. */
export function guessSource(text: string): string {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > lat ? "ar" : "en";
}

interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<{ translate(t: string): Promise<string> }>;
}

/** True when this phone's browser can translate on the device. */
export function canTranslateOnDevice(): boolean {
  return typeof (globalThis as { Translator?: unknown }).Translator !== "undefined";
}

/** Translates on the device, paragraph by paragraph. Null when not possible here. */
export async function translateOnDevice(text: string, to: string, progress?: (done: number, all: number) => void): Promise<string | null> {
  const T = (globalThis as { Translator?: TranslatorApi }).Translator;
  if (!T) return null;
  const from = guessSource(text);
  if (from === to) return text;
  try {
    const a = await T.availability({ sourceLanguage: from, targetLanguage: to });
    if (a === "unavailable" || a === "no") return null;
    const tr = await T.create({ sourceLanguage: from, targetLanguage: to });
    const parts = text.split(/\n/);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      progress?.(i, parts.length);
      out.push(parts[i].trim() ? await tr.translate(parts[i]) : "");
    }
    return out.join("\n");
  } catch {
    return null;
  }
}

/** Link that opens Google Translate with the text (it goes online). */
export function onlineTranslateUrl(text: string, to: string): string {
  const cut = text.length > 4500 ? text.slice(0, 4500) : text;
  return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(to)}&op=translate&text=${encodeURIComponent(cut)}`;
}
