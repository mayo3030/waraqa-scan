import { expect, openApp, saved, scan, tab, test } from "./app";

const wipe = (page: import("@playwright/test").Page) =>
  page.evaluate(() => new Promise<void>((res) => {
    const q = indexedDB.deleteDatabase("waraqa-scan");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));

// F12: back up, lose everything, restore.
test("back up, wipe the app, restore: everything comes back", async ({ page }) => {
  await openApp(page);
  await scan(page);
  await page.getByLabel("Document name").fill("Car title 🚗");
  await page.getByLabel("Document name").blur();
  await page.getByRole("button", { name: "Back" }).click();
  await tab(page, "Me");
  const backup = await saved(page, () => page.getByRole("button", { name: "Back up all documents" }).click());
  expect(backup.name).toMatch(/^waraqa-backup-\d{4}-\d{2}-\d{2}\.waraqa$/);
  await expect(page.getByText("Backup ready: 2 documents.")).toBeVisible();
  const file = { name: backup.name, mimeType: "application/octet-stream", buffer: backup.data };

  // Restoring onto the same data adds nothing
  await page.getByLabel("Restore from a backup").setInputFiles(file);
  await expect(page.getByText("0 documents restored, 2 already on this phone")).toBeVisible();

  // A fresh install gets everything back
  await page.goto("about:blank");
  await page.goto("/");
  await wipe(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Scan your first page" })).toBeVisible();
  await tab(page, "Me");
  await expect(page.getByRole("button", { name: "Back up all documents" })).toBeDisabled();
  await page.getByLabel("Restore from a backup").setInputFiles(file);
  await expect(page.getByText("2 documents restored")).toBeVisible();
  await tab(page, "All Documents");
  await page.getByRole("button", { name: /Car title 🚗/ }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible();
});

test("a damaged or wrong backup file is refused and nothing changes", async ({ page }) => {
  await openApp(page);
  await tab(page, "Me");
  const backup = await saved(page, () => page.getByRole("button", { name: "Back up all documents" }).click());
  const pick = (buffer: Buffer) => page.getByLabel("Restore from a backup").setInputFiles({ name: "x.waraqa", mimeType: "application/octet-stream", buffer });

  await pick(Buffer.from("just some text, not a backup"));
  await expect(page.getByText("This is not a Waraqa backup file.")).toBeVisible();
  await pick(backup.data.subarray(0, backup.data.length - 500));
  await expect(page.getByText(/The backup file is damaged/)).toBeVisible();
  await tab(page, "All Documents");
  await expect(page.getByRole("heading", { name: /All/ })).toContainText("(1)");
});
