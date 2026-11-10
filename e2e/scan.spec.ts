import { expect, isJpeg, isPdf, openApp, pdfPages, PHOTO, PHOTO_2, PHOTO_3, saved, scan, tab, test } from "./app";

// F01: one page from photo to PDF.
test("scan a page and save it as a PDF", async ({ page }) => {
  await openApp(page);
  await scan(page);
  const pdf = await saved(page, async () => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "Save PDF" }).click();
  });
  expect(pdf.name).toMatch(/^Scan .*\.pdf$/);
  expect(isPdf(pdf.data)).toBe(true);
  expect(await pdfPages(pdf.data)).toBe(1);
  await expect(page.getByText("PDF saved")).toBeVisible();
});

// F02: several pages, reorder, delete, and F09: still there after closing the app.
test("three pages: reorder, delete one, and they survive a restart", async ({ page }) => {
  await openApp(page);
  await scan(page, [PHOTO, PHOTO_2, PHOTO_3]);
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(3);

  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Page 1 of 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Earlier" })).toBeDisabled();
  await page.getByRole("button", { name: "Later" }).click();
  await expect(page.getByRole("heading", { name: "Page 2 of 3" })).toBeVisible();

  const jpg = await saved(page, () => page.getByRole("button", { name: "JPG" }).click());
  expect(isJpeg(jpg.data)).toBe(true);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Page deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);

  const pdf = await saved(page, async () => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "Save PDF" }).click();
  });
  expect(await pdfPages(pdf.data)).toBe(2);

  await page.reload();
  await expect(page.getByText("Sample: bill of sale").first()).toBeVisible();
  await tab(page, "All Documents");
  await expect(page.getByRole("heading", { name: /All/ })).toContainText("(2)");
  await page.getByRole("button", { name: /^Scan / }).first().click();
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);
});

test("leaving in the middle of a scan saves nothing", async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Import Images").setInputFiles(PHOTO);
  await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Recents" })).toBeVisible();
  await tab(page, "All Documents");
  await expect(page.getByRole("heading", { name: /All/ })).toContainText("(1)");
});

test("a file that is not a photo is refused with a message", async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Import Images").setInputFiles({ name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("this is not an image") });
  await expect(page.getByText("That file could not be opened as a photo")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Recents" })).toBeVisible();
});

test("rename a document with Arabic, emoji and a very long name", async ({ page }) => {
  await openApp(page);
  await scan(page);
  const name = "عقد الإيجار 🏠 " + "long ".repeat(40);
  const title = page.getByLabel("Document name");
  await title.fill(name);
  await title.blur();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("عقد الإيجار 🏠").first()).toBeVisible();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide, "a long name must not push the page sideways").toBe(false);
});
