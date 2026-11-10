import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, isJpeg, openApp, PHOTO, saved, scan, tab, test } from "./app";

// The AI tools run on Replicate with the person's own token. Here Replicate is a stand-in
// that answers like the real API, so the whole flow is tested without spending credit.

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
/** A PNG with a see-through background and an opaque orange disc in the middle. */
function cutoutPng(w = 300, h = 400): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3) ** 2;
      raw[o] = 230; raw[o + 1] = 120; raw[o + 2] = 30; raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

type Sent = { version: string; input: Record<string, unknown> };
async function fakeReplicate(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("https://api.replicate.com/v1/models/**", (r) => r.fulfill({
    json: { latest_version: { id: "test-version", openapi_schema: { components: { schemas: { Input: { properties: { image: {}, scale: {}, face_enhance: {}, background_type: {}, format: {} } } } } } } },
  }));
  await page.route("https://api.replicate.com/v1/predictions", async (r) => {
    const body = r.request().postDataJSON() as Sent;
    sent.push(body);
    expect(r.request().headers()["authorization"]).toBe("Bearer r8_testtoken");
    const out = "background_type" in body.input ? "https://replicate.delivery/test/cut.png" : "https://replicate.delivery/test/hd.jpg";
    await r.fulfill({ status: 201, json: { status: "succeeded", output: out } });
  });
  await page.route("https://replicate.delivery/test/hd.jpg", (r) => r.fulfill({ body: readFileSync(PHOTO), contentType: "image/jpeg" }));
  await page.route("https://replicate.delivery/test/cut.png", (r) => r.fulfill({ body: cutoutPng(), contentType: "image/png" }));
  return sent;
}

async function saveToken(page: Page) {
  await tab(page, "Me");
  await page.getByLabel("Replicate API token").fill("r8_testtoken");
  await page.getByLabel("Replicate API token").locator("..").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await tab(page, "Home");
}

const tools = (page: Page, name: string) => page.getByRole("button", { name: "Tools", exact: true }).click().then(() => page.getByRole("button", { name, exact: true }).click());

test("without a Replicate token the AI tools say where to add one", async ({ page }) => {
  await openApp(page);
  await scan(page);
  await tools(page, "AI HD");
  await expect(page.getByText("Add your Replicate key in Me > AI keys to use this.")).toBeVisible();
});

test("AI HD: Ultra HD replaces the page with the sharper, larger one", async ({ page }) => {
  const sent = await fakeReplicate(page);
  await openApp(page);
  await saveToken(page);
  await scan(page);
  await tools(page, "AI HD");
  await expect(page.getByRole("heading", { name: "AI HD" })).toBeVisible();
  await page.getByRole("radio", { name: "Ultra HD (4x)" }).click();
  await page.getByText("Also fix faces").click();
  await page.getByRole("button", { name: "Make it HD" }).click();
  await expect(page.getByText("Page is now 1500 x 2000. Edit brings back the original.")).toBeVisible({ timeout: 60_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0].version).toBe("test-version");
  expect(sent[0].input.scale).toBe(4);
  expect(sent[0].input.face_enhance).toBe(true);
  expect(String(sent[0].input.image)).toMatch(/^data:image\/jpeg;base64,/);
  // the page itself is now the HD one
  const jpg = await saved(page, async () => {
    await page.getByRole("button", { name: "Page 1", exact: true }).click();
    await page.getByRole("button", { name: "JPG" }).click();
  });
  expect(isJpeg(jpg.data)).toBe(true);
});

test("Remove background: new colour on the page, or a see-through PNG", async ({ page }) => {
  const sent = await fakeReplicate(page);
  await openApp(page);
  await saveToken(page);
  await scan(page);
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await page.getByRole("button", { name: "Remove BG" }).click();
  await expect(page.getByRole("heading", { name: "Remove background" })).toBeVisible();
  await page.getByRole("button", { name: "Remove background" }).click();
  await expect(page.getByRole("img", { name: "The cut-out" })).toBeVisible({ timeout: 60_000 });
  expect(sent[0].input.background_type).toBe("rgba");

  const png = await saved(page, async () => {
    await page.getByRole("radio", { name: "See-through" }).click();
    await page.getByRole("button", { name: "Save as PNG" }).click();
  });
  expect(png.name).toMatch(/cut-out\.png$/);
  expect(png.data.subarray(1, 4).toString()).toBe("PNG");

  await page.getByRole("radio", { name: "Blue", exact: true }).click();
  await page.getByRole("button", { name: "Use on page" }).click();
  await expect(page.getByText("New background saved. Edit brings back the original.")).toBeVisible();
  expect(sent).toHaveLength(1); // changing the colour does not call the AI again
});

test("Clean up offers eight looks, starts on Auto, and saves the one picked", async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Import Images").setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Next" }).click({ timeout: 60_000 });
  const looks = page.getByRole("radiogroup", { name: "Filter" }).getByRole("radio");
  await expect(looks).toHaveText(["Auto", "Original", "Magic Color", "Photo", "Lighten", "No Shadow", "Gray", "B&W"]);
  await expect(page.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "No Shadow" }).click();
  await expect(page.getByRole("radio", { name: "No Shadow" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "No Shadow" })).toBeInViewport();
  await page.getByRole("button", { name: "Save page" }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("radio", { name: "No Shadow" })).toHaveAttribute("aria-checked", "true");
});

test("the AI tools are in the Tools tab and the camera's All Features", async ({ page }) => {
  await openApp(page);
  await tab(page, "Tools");
  await expect(page.getByRole("button", { name: "AI HD", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Background", exact: true })).toBeVisible();
  await tab(page, "Home");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "All Features" }).click();
  const sheet = page.getByRole("dialog", { name: "All features" });
  await expect(sheet.getByRole("button", { name: "AI HD" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Remove Background" })).toBeVisible();
});
