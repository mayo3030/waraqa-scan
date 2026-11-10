// AI client against a fake network: no real keys and no real calls.
import { MissingKey, docContext, openRouterChat, replicate, OPENROUTER_MODEL } from "../src/lib/ai";

const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
const calls: { method: string; url: string; headers: any; body: any }[] = [];
let script: ((c: (typeof calls)[number]) => { status: number; body: any })[] = [];
(globalThis as any).fetch = async (url: string, o: any) => {
  const c = { method: o?.method ?? "GET", url, headers: o?.headers ?? {}, body: o?.body ? JSON.parse(o.body) : undefined };
  calls.push(c);
  const r = script.shift()!(c);
  return { status: r.status, ok: r.status < 300, text: async () => JSON.stringify(r.body) };
};
const ok = (c: boolean, m: string) => { if (!c) { console.error("FAIL " + m); process.exit(1); } };

// No key: a clear message, no network call.
try { await openRouterChat([{ role: "user", content: "hi" }]); ok(false, "no key should throw"); }
catch (e) { ok(e instanceof MissingKey && /Me > AI keys/.test((e as Error).message), "missing key message"); }
ok(calls.length === 0, "no call without a key");

// OpenRouter request shape and answer.
store.set("waraqa-key-openrouter", "test-or");
script = [() => ({ status: 200, body: { choices: [{ message: { content: " Hello " } }] } })];
const ctx = await docContext("Bill", "Total 40", []);
ok((await openRouterChat([...ctx, { role: "user", content: "total?" }])) === "Hello", "chat answer");
ok(calls[0].url.endsWith("/chat/completions") && calls[0].body.model === OPENROUTER_MODEL && calls[0].headers.Authorization === "Bearer test-or", "chat request");
ok(calls[0].body.messages.length === 4, "context plus question");

// Bad key is explained.
script = [() => ({ status: 401, body: { error: { message: "no" } } })];
try { await openRouterChat([{ role: "user", content: "x" }]); ok(false, "401 should throw"); }
catch (e) { ok(/did not accept the key/.test((e as Error).message), "401 message"); }

// Replicate: newest version, unknown inputs dropped, then polling.
store.set("waraqa-key-replicate", "test-rp");
calls.length = 0;
script = [
  () => ({ status: 200, body: { latest_version: { id: "v2", openapi_schema: { components: { schemas: { Input: { properties: { image: {}, upscale: {} } } } } } } } }),
  () => ({ status: 201, body: { status: "starting", urls: { get: "https://api.replicate.com/v1/predictions/p1" } } }),
  () => ({ status: 200, body: { status: "succeeded", output: "https://replicate.delivery/out.png" } }),
];
const out = await replicate("owner/model", "v1", { image: "data:x", upscale: 2, renamed: true });
ok(out === "https://replicate.delivery/out.png", "replicate output");
ok(calls[1].body.version === "v2" && calls[1].body.input.upscale === 2 && !("renamed" in calls[1].body.input), "version and inputs");
ok(calls[1].headers.Prefer === "wait=55", "wait header");

// Model lookup fails: falls back to the built-in version; 422 retries with the image only.
calls.length = 0;
script = [
  () => ({ status: 404, body: {} }),
  () => ({ status: 422, body: { detail: "bad input" } }),
  () => ({ status: 201, body: { status: "succeeded", output: ["a", "https://replicate.delivery/b.png"] } }),
];
ok((await replicate("owner/other", "v1", { image: "data:y", model_size: "large" })) === "https://replicate.delivery/b.png", "array output");
ok(calls[1].body.version === "v1" && Object.keys(calls[2].body.input).join() === "image", "fallback and retry");
console.log("ai tests passed");
