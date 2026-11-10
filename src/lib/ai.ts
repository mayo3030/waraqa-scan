// Online AI features, called straight from the phone with the user's own keys
// (no Waraqa server). OpenRouter: formula to LaTeX and AI Chat.
// Replicate: AI photo restore (CodeFormer) and colorize (DDColor).
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { getSecret, type SecretName } from "./secrets";
import { blobToRaster, rasterToBlob } from "./io";

export const OPENROUTER_MODEL = "anthropic/claude-haiku-5.5";
const CODEFORMER = "cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2"; // sczhou/codeformer
const DDCOLOR = "ca494ba129e44e45f661d6ece83c4c98a9a7c774309beca01429b58fce8aa695"; // piddnad/ddcolor

/** Thrown when the feature's key is not saved yet. */
export class MissingKey extends Error {
  constructor(public key: SecretName) {
    super(`Add your ${key === "openrouter" ? "OpenRouter" : "Replicate"} key in Me > AI keys to use this.`);
  }
}

async function needKey(name: SecretName): Promise<string> {
  const k = await getSecret(name);
  if (!k) throw new MissingKey(name);
  return k;
}

type Json = Record<string, unknown>;

/** JSON over HTTPS. The app uses Android's own HTTP (no browser CORS limits). */
async function http(method: "GET" | "POST", url: string, headers: Record<string, string>, body?: Json): Promise<{ status: number; data: Json }> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url, headers: { "Content-Type": "application/json", ...headers }, data: body, responseType: "json", connectTimeout: 30000, readTimeout: 120000 });
    const data = typeof r.data === "string" ? safeJson(r.data) : (r.data as Json);
    return { status: r.status, data };
  }
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: safeJson(await r.text()) };
}

function safeJson(t: string): Json {
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

function apiError(service: string, status: number, data: Json): Error {
  if (status === 401 || status === 403) return new Error(`${service} did not accept the key. Check it in Me > AI keys.`);
  if (status === 402) return new Error(`${service} says the account has no credit left.`);
  if (status === 429) return new Error(`${service} is busy or the limit was reached. Try again in a minute.`);
  const msg = (data.error as Json | undefined)?.message ?? data.detail ?? data.error;
  return new Error(`${service} error ${status}${typeof msg === "string" ? ": " + msg.slice(0, 160) : ""}`);
}

async function dataUrl(blob: Blob, maxSide: number, quality = 0.85): Promise<string> {
  const r = await blobToRaster(blob, maxSide);
  const small = await rasterToBlob(r, quality);
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(small);
  });
}

// ---------- OpenRouter ----------

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMsg { role: "system" | "user" | "assistant"; content: string | ChatPart[] }

export async function openRouterChat(messages: ChatMsg[], maxTokens = 1500): Promise<string> {
  const key = await needKey("openrouter");
  const r = await http("POST", "https://openrouter.ai/api/v1/chat/completions", {
    Authorization: `Bearer ${key}`,
    "X-Title": "Waraqa Scan",
  }, { model: OPENROUTER_MODEL, messages, max_tokens: maxTokens });
  if (r.status >= 300) throw apiError("OpenRouter", r.status, r.data);
  const choice = (r.data.choices as { message?: { content?: string } }[] | undefined)?.[0];
  const text = choice?.message?.content;
  if (typeof text !== "string") throw new Error("OpenRouter sent an empty answer");
  return text.trim();
}

/** Reads the formulas in a cropped page photo and returns LaTeX, one formula per line. */
export async function formulaToLatex(image: Blob): Promise<string> {
  const out = await openRouterChat([
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: await dataUrl(image, 1600) } },
        {
          type: "text",
          text: "Transcribe every mathematical formula or equation in this image as LaTeX. " +
            "Output one formula per line, in reading order, with no $ signs, no code fences and no comments. " +
            "If a line is plain text rather than math, output it as \\text{...}. If there is no math, output NONE.",
        },
      ],
    },
  ], 2000);
  const cleaned = out.replace(/^```(?:latex)?\s*|```$/gm, "").trim();
  return cleaned === "NONE" ? "" : cleaned;
}

/** Builds the first message of an AI Chat about a document. */
export async function docContext(name: string, text: string, images: Blob[]): Promise<ChatMsg[]> {
  const parts: ChatPart[] = [];
  for (const b of images.slice(0, 3)) parts.push({ type: "image_url", image_url: { url: await dataUrl(b, 1400, 0.8) } });
  parts.push({
    type: "text",
    text: `Document name: ${name}\n\nText read from the scanned pages:\n${text.slice(0, 60000) || "(no text read yet; use the page images)"}`,
  });
  return [
    {
      role: "system",
      content: "You help the user with one scanned document from their phone. Answer from the document; say so when it does not contain the answer. " +
        "Reply in the language the user writes in. Keep answers short and plain, suited to a phone screen.",
    },
    { role: "user", content: parts },
    { role: "assistant", content: "I have the document. What would you like to know?" },
  ];
}

// ---------- Replicate ----------

const latest = new Map<string, { version: string; inputs: string[] | null }>();

/** The model's newest version and the inputs it takes, read from Replicate itself. */
async function modelInfo(model: string, auth: Record<string, string>): Promise<{ version: string; inputs: string[] | null } | null> {
  const known = latest.get(model);
  if (known) return known;
  const r = await http("GET", `https://api.replicate.com/v1/models/${model}`, auth);
  if (r.status >= 300) return null;
  const v = r.data.latest_version as Json | undefined;
  if (typeof v?.id !== "string") return null;
  const props = ((((v.openapi_schema as Json | undefined)?.components as Json | undefined)?.schemas as Json | undefined)?.Input as Json | undefined)?.properties;
  const info = { version: v.id, inputs: props && typeof props === "object" ? Object.keys(props) : null };
  latest.set(model, info);
  return info;
}

export async function replicate(model: string, fallbackVersion: string, wanted: Json, onWait?: (s: string) => void): Promise<string> {
  const key = await needKey("replicate");
  const auth = { Authorization: `Bearer ${key}` };
  const info = await modelInfo(model, auth).catch(() => null);
  const version = info?.version ?? fallbackVersion;
  // Send only the inputs this version knows, so a renamed option cannot break the call.
  const input = info?.inputs ? Object.fromEntries(Object.entries(wanted).filter(([k]) => k === "image" || info.inputs!.includes(k))) : wanted;
  let r = await http("POST", "https://api.replicate.com/v1/predictions", { ...auth, Prefer: "wait=55" }, { version, input });
  if (r.status === 422 && Object.keys(input).length > 1) {
    r = await http("POST", "https://api.replicate.com/v1/predictions", { ...auth, Prefer: "wait=55" }, { version, input: { image: wanted.image } });
  }
  if (r.status >= 300) throw apiError("Replicate", r.status, r.data);
  let p = r.data;
  const started = Date.now();
  while (p.status !== "succeeded") {
    if (p.status === "failed" || p.status === "canceled") throw new Error(`Replicate could not finish: ${String(p.error ?? p.status).slice(0, 160)}`);
    if (Date.now() - started > 240000) throw new Error("Replicate took too long. Try again later.");
    onWait?.(p.status === "starting" ? "Starting the AI model (first run can take a minute)" : "Working on the photo");
    await new Promise((res) => setTimeout(res, 2500));
    const get = (p.urls as { get?: string } | undefined)?.get;
    if (!get) throw new Error("Replicate sent no status link");
    r = await http("GET", get, auth);
    if (r.status >= 300) throw apiError("Replicate", r.status, r.data);
    p = r.data;
  }
  const out = Array.isArray(p.output) ? p.output[p.output.length - 1] : p.output;
  if (typeof out !== "string") throw new Error("Replicate sent no image");
  return out;
}

async function download(url: string): Promise<Blob> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method: "GET", url, responseType: "blob", readTimeout: 120000 });
    if (r.status >= 300) throw new Error("The result could not be downloaded");
    const bin = atob(String(r.data));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: (r.headers?.["Content-Type"] ?? r.headers?.["content-type"] ?? "image/png") as string });
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("The result could not be downloaded");
  return r.blob();
}

/** AI restore (faces and detail) or AI colorize of a photo. */
export async function aiPhoto(kind: "restore" | "colorize", photo: Blob, onWait?: (s: string) => void): Promise<Blob> {
  const image = await dataUrl(photo, kind === "restore" ? 1200 : 1600, 0.9);
  const url = kind === "restore"
    ? await replicate("sczhou/codeformer", CODEFORMER, { image, codeformer_fidelity: 0.7, background_enhance: true, face_upsample: true, upscale: 2 }, onWait)
    : await replicate("piddnad/ddcolor", DDCOLOR, { image, model_size: "large" }, onWait);
  return download(url);
}
