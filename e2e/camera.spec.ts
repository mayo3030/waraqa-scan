import { expect, openApp, saved, scan, test, isPdf, pdfPages } from "./app";

// F08: the camera and its modes, with the browser's test camera.
test("modes, Single and Batch, and All Features", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Single" })).toBeVisible();
  await page.getByRole("radio", { name: "Batch" }).click();
  await expect(page.getByRole("radio", { name: "Batch" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("tab", { name: "Book", exact: true }).click();
  const intro = page.getByRole("dialog", { name: "Book" });
  await expect(intro).toContainText("splits them at the spine");
  await intro.getByRole("button", { name: "Capture" }).click();
  await expect(intro).toBeHidden();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();

  await page.getByRole("button", { name: "All Features" }).click();
  const sheet = page.getByRole("dialog", { name: "All features" });
  for (const g of ["Scan Documents", "Convert Formats", "Doc Tools", "Enhance Images", "Capture Screens", "More"]) await expect(sheet.getByRole("heading", { name: g })).toBeVisible();
  await sheet.getByRole("button", { name: "Scan Code" }).click();
  await expect(page.getByRole("tab", { name: "Scan Code" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Point at a QR code or barcode")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Camera settings" })).toBeVisible();
});

test("take a photo with the camera and save it as a page", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("radio", { name: "Single" }).click();
  const shutter = page.getByRole("button", { name: "Take photo" });
  await expect(shutter).toBeEnabled({ timeout: 30_000 });
  await shutter.click();
  await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Whole photo" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Save page" }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 60_000 });
});

// F03: bring in a PDF and other files.
test("import a PDF made by the app, and refuse a broken file", async ({ page }) => {
  await openApp(page);
  await scan(page);
  const pdf = await saved(page, async () => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "Save PDF" }).click();
  });
  expect(isPdf(pdf.data)).toBe(true);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByLabel("Import Files").setInputFiles({ name: "Lease 2026.pdf", mimeType: "application/pdf", buffer: pdf.data });
  await expect(page.getByText("1 page imported")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Document name")).toHaveValue("Lease 2026");
  expect(await pdfPages(pdf.data)).toBe(1);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByLabel("Import Files").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 broken") });
  await expect(page.getByText("Those files could not be opened. PDF and image files work.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Recents" })).toBeVisible();
});
