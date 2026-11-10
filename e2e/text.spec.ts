import { expect, isPdf, isZip, openApp, pdfText, saved, scan, test } from "./app";

// F04 and the searchable PDF: read the text, find the document by it, find it inside the PDF.
test("read text, search by it, and export a searchable PDF", async ({ page }) => {
  await openApp(page);
  await scan(page);

  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByText("Not searchable yet")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Read text" }).click();
  const box = page.getByRole("textbox").last();
  await expect(box).toHaveValue(/BILL OF SALE/, { timeout: 110_000 });
  await expect(box).toHaveValue(/Camry/);
  await expect(box).toHaveValue(/4T1B11HK5KU000000/); // the VIN, all 17 characters
  await page.getByRole("button", { name: "Close" }).click();

  const pdf = await saved(page, async () => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await expect(page.getByText("Searchable: the read text goes into the PDF")).toBeVisible();
    await page.getByRole("button", { name: "Save PDF" }).click();
  });
  expect(isPdf(pdf.data)).toBe(true);
  const text = await pdfText(pdf.data);
  expect(text).toContain("BILL OF SALE");
  expect(text).toContain("Camry");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Back" }).click();
  const search = page.getByRole("searchbox");
  await search.fill("odometer");
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Scan / })).toHaveCount(1);
  await search.fill("zzz-nothing");
  await expect(page.getByText(/No document matches/)).toBeVisible();
});

// F05: convert to the three Office formats.
test("convert a document to Word, Excel and PowerPoint", async ({ page }) => {
  await openApp(page);
  await scan(page);
  const make = async (tool: string, button: string, ext: string) => {
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByRole("button", { name: tool, exact: true }).click();
    const f = await saved(page, () => page.getByRole("button", { name: button }).click());
    expect(f.name.endsWith(ext), `${f.name} ends with ${ext}`).toBe(true);
    expect(isZip(f.data)).toBe(true);
    expect(f.data.length).toBeGreaterThan(2000);
    await page.getByRole("button", { name: "Close" }).click().catch(() => {});
  };
  await make("To Word", "Make Word file", ".docx");
  await make("To Excel", "Make Excel file", ".xlsx");
  await make("To PPT", "Make slides", ".pptx");
});
