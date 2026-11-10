import { expect, openApp, PHOTO, PHOTO_2, scan, tab, test } from "./app";

// The document tools sheet: every tool opens what it says.
test("extract, reorder and the PDF tools open the right screens", async ({ page }) => {
  await openApp(page);
  await scan(page, [PHOTO, PHOTO_2]);
  const tool = async (name: string) => {
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  const close = () => page.getByRole("button", { name: "Close" }).click();

  await tool("Reorder");
  await expect(page.getByRole("heading", { name: "Reorder pages" })).toBeVisible();
  await page.getByRole("button", { name: "Move down" }).first().click();
  await close();
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);

  for (const [name, heading] of [["Lock", "Lock with password"], ["Compress", "Compress PDF"], ["Watermark", "Add watermark"], ["Print", "Print"], ["Tags & Folder", "Tags and folder"], ["Translate", "Translate"]] as const) {
    await tool(name);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await close();
  }

  await tool("Extract Pages");
  await expect(page.getByRole("heading", { name: "Extract pages" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Page 1", exact: true }).click();
  await page.getByRole("button", { name: "Make new document with 1" }).click();
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(1);
});

test("sign a page: draw, save, place", async ({ page }) => {
  await openApp(page);
  await scan(page);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draw your signature" })).toBeVisible();
  const pad = page.locator("canvas").last();
  const b = (await pad.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 30 + i * 18, b.y + b.height / 2 + (i % 2 ? -22 : 22));
  await page.mouse.up();
  await page.getByRole("button", { name: "Save signature" }).click();
  await expect(page.getByRole("button", { name: "Use this signature" }).first()).toBeVisible();
});

test("smart erase and erase marks work on a page", async ({ page }) => {
  await openApp(page);
  await scan(page);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Erase Marks", exact: true }).click();
  await expect(page.getByText(/Page updated/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Smart Erase", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear brush" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible();
});

test("a tool started from the Tools tab asks which document", async ({ page }) => {
  await openApp(page);
  await tab(page, "Tools");
  await page.getByRole("button", { name: "To Word", exact: true }).click();
  await expect(page.getByRole("heading", { name: "To Word: pick a document" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /Sample: bill of sale/ }).click();
  await expect(page.getByRole("heading", { name: "To Word", exact: true })).toBeVisible();
});

// The special camera modes, with the browser's test camera.
test("ID card: front and back become one page", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "ID Cards" }).click();
  const intro = page.getByRole("dialog", { name: "ID cards" });
  await intro.getByRole("radio", { name: "Driver License" }).click();
  await intro.getByRole("checkbox", { name: /Remove glare/ }).uncheck();
  await intro.getByRole("button", { name: "Make it now" }).click();
  const shutter = page.getByRole("button", { name: "Take photo" });
  await expect(page.getByText("Front side inside the frame", { exact: true })).toBeVisible();
  await shutter.click();
  await expect(page.getByText("Now the back")).toBeVisible({ timeout: 30_000 });
  await shutter.click();
  // Each side gets its corners checked, then both land on one sheet.
  for (const save of ["Save, next photo", "Save page"]) {
    await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Whole photo" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: save }).click();
  }
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(1);
});

for (const [mode, heading] of [["CountCam", "CountCam"], ["ID Photo", "ID photo"], ["Greeting Card", "Greeting Card"]] as const) {
  test(`${mode} opens its own screen after the photo`, async ({ page }) => {
    await openApp(page);
    await tab(page, "Tools");
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 60_000 });
  });
}
