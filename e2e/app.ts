// Shared steps for the end-to-end tests. Every test starts on a fresh install
// (empty storage, the sample document seeded) and fails on any console error.
import { test as base, expect, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const fixture = (name: string) => fileURLToPath(new URL("../tests/fixtures/" + name, import.meta.url));
export const PHOTO = fixture("photo-wood.jpg");
export const PHOTO_2 = fixture("photo-desk.jpg");
export const PHOTO_3 = fixture("photo-light.jpg");

/** What GitHub answers for "newest release". build 14 is what the stand-in app reports. */
export const release = (build: number) => ({
  tag_name: `v1.2.${build}`,
  body: "Test release notes.",
  assets: [{ name: `waraqa-scan-1.2.${build}.apk`, browser_download_url: "https://example.invalid/waraqa.apk" }],
});

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    // By default the app is up to date; update.spec.ts overrides this.
    await page.route("**/api.github.com/**", (r) => r.fulfill({ json: release(14) }));
    await use(errors);
    expect(errors, "console errors during the test").toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Sample: bill of sale").first()).toBeVisible();
}

export const tab = (page: Page, name: "Home" | "All Documents" | "Tools" | "Me") =>
  page.getByRole("button", { name, exact: true }).click();

/** Home > Import Images > corners > filter > save. Ends on the new document. */
export async function scan(page: Page, files: string[] = [PHOTO]) {
  await page.getByLabel("Import Images").setInputFiles(files);
  for (let i = 0; i < files.length; i++) {
    await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Page found|Drag the four corners/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Clean up" })).toBeVisible();
    await page.getByRole("button", { name: i < files.length - 1 ? "Save, next photo" : "Save page" }).click();
  }
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 60_000 });
}

export async function saved(page: Page, click: () => Promise<unknown>): Promise<{ name: string; data: Buffer; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), data: await readFile(path), download };
}

export const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";
export const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b;
export const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;

/** The text a PDF viewer would find when searching, page by page. */
export async function pdfText(data: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  let all = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    all += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return all.normalize("NFKC").replace(/\s+/g, " ");
}
export async function pdfPages(data: Buffer): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise).numPages;
}
