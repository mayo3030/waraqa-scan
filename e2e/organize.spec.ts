import { expect, openApp, PHOTO, PHOTO_2, saved, scan, tab, test, pdfPages } from "./app";

const count = (page: import("@playwright/test").Page) => page.getByRole("heading", { name: /\(\d+\)/ });

// F07: folders, tags, merge, delete several.
test("folders, tags, merge and deleting several documents", async ({ page }) => {
  await openApp(page);
  await scan(page, [PHOTO]);
  await page.getByRole("button", { name: "Back" }).click();
  await scan(page, [PHOTO_2]);
  await page.getByRole("button", { name: "Back" }).click();
  await tab(page, "All Documents");
  await expect(count(page)).toContainText("(3)");

  // A folder with an Arabic and emoji name
  await page.getByRole("button", { name: "Create Folder" }).click();
  await page.getByPlaceholder("Folder name").fill("عقود 📁");
  await page.getByRole("button", { name: "Make folder" }).click();
  await expect(page.getByRole("heading", { name: /عقود/ })).toContainText("(0)");
  await page.getByRole("button", { name: "All documents", exact: true }).click();
  await expect(page.getByRole("button", { name: /عقود 📁/ })).toBeVisible();

  // Move the two scans into it
  await page.getByRole("button", { name: "Select" }).click();
  for (const row of await page.getByRole("button", { name: /^Scan / }).all()) await row.click();
  await expect(page.getByRole("heading", { name: "2 selected" })).toBeVisible();
  await page.getByRole("button", { name: "Move" }).click();
  await page.getByRole("button", { name: /عقود 📁/ }).click();
  await expect(page.getByText("Moved to folder")).toBeVisible();
  await page.getByRole("button", { name: /عقود 📁/ }).click();
  await expect(count(page)).toContainText("(2)");

  // Tag one, then filter by the tag
  await page.getByRole("button", { name: "Select" }).click();
  await page.getByRole("button", { name: /^Scan / }).first().click();
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await page.getByRole("button", { name: "Contract" }).click();
  await expect(page.getByText("Tagged “Contract”")).toBeVisible();
  await page.getByRole("button", { name: "Contract", exact: true }).click();
  await expect(count(page)).toContainText("(1)");
  await page.getByRole("button", { name: "Contract", exact: true }).click();

  // Merge the two into a new document with both pages
  await page.getByRole("button", { name: "Select" }).click();
  for (const row of await page.getByRole("button", { name: /^Scan / }).all()) await row.click();
  await page.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(2);
  const pdf = await saved(page, async () => {
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "Save PDF" }).click();
  });
  expect(await pdfPages(pdf.data)).toBe(2);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  // Delete the folder: its documents are kept
  await tab(page, "All Documents");
  await page.getByRole("button", { name: /عقود 📁/ }).click();
  await page.getByRole("button", { name: "Rename or delete" }).click();
  await page.getByRole("button", { name: "Delete folder, keep its documents" }).click();
  await expect(count(page)).toContainText("(4)");

  // Delete three at once, with a confirmation
  await page.getByRole("button", { name: "Select" }).click();
  for (const row of await page.getByRole("button", { name: /^(Scan|Merged) / }).all()) await row.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delete 3 documents?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep them" }).click();
  await expect(page.getByRole("heading", { name: "3 selected" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan", exact: true })).toHaveCount(0); // the floating button stays out of the way
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(page.getByText("Deleted 3 documents")).toBeVisible();
  await expect(count(page)).toContainText("(1)");
});

test("sort and grid view are remembered", async ({ page }) => {
  await openApp(page);
  await tab(page, "All Documents");
  await page.getByRole("button", { name: "Show as grid" }).click();
  await page.getByRole("button", { name: "Sort" }).click();
  await page.getByRole("button", { name: "Name" }).click();
  await page.reload();
  await tab(page, "All Documents");
  await expect(page.getByRole("button", { name: "Show as list" })).toBeVisible();
});
