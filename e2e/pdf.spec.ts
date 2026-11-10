import { expect, isJpeg, isPdf, openApp, saved, scan, test } from "./app";

// F06: the PDF options.
test("password, watermark and compression change the PDF", async ({ page }) => {
  await openApp(page);
  await scan(page);
  const save = async (setup: () => Promise<void>) => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await setup();
    const f = await saved(page, () => page.getByRole("button", { name: "Save PDF" }).click());
    expect(isPdf(f.data)).toBe(true);
    await page.getByRole("button", { name: "Close" }).click().catch(() => {});
    return f;
  };
  const plain = await save(async () => {});
  expect(plain.data.includes("/Encrypt")).toBe(false);

  const small = await save(async () => { await page.getByText("Smaller file (lower quality)").click(); });
  expect(small.data.length).toBeLessThan(plain.data.length * 0.8);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.getByText("Smaller file (lower quality)").click();
  await page.getByRole("button", { name: "Close" }).click();

  const marked = await save(async () => { await page.getByLabel("Watermark").fill("For bank use only"); });
  expect(marked.data.equals(plain.data)).toBe(false);

  const locked = await save(async () => {
    await page.getByLabel("Watermark").fill("");
    await page.getByLabel("Password").fill("سر 1234");
  });
  expect(locked.name).toContain("(locked)");
  expect(locked.data.includes("/Encrypt")).toBe(true);
});

test("save all pages as images and as one long image", async ({ page }) => {
  await openApp(page);
  await scan(page);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const img = await saved(page, () => page.getByRole("button", { name: "Images", exact: true }).click());
  expect(isJpeg(img.data)).toBe(true);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const long = await saved(page, () => page.getByRole("button", { name: "Long Image", exact: true }).click());
  expect(isJpeg(long.data)).toBe(true);
});
