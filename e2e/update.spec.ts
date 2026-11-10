import { expect, openApp, release, tab, test } from "./app";

// F10: updating from inside the app. The stand-in app is version 1.2.14 (build 14).
test("a newer version is offered when the app opens, and installs", async ({ page }) => {
  await page.route("**/api.github.com/**", (r) => r.fulfill({ json: release(20) }));
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "App update" });
  await expect(sheet.getByRole("heading", { name: "Version 1.2.20 is ready" })).toBeVisible();
  await expect(sheet).toContainText("You have 1.2.14");
  await expect(sheet).toContainText("Test release notes.");
  await sheet.getByRole("button", { name: "Download and install" }).click();
  await expect(sheet.getByRole("progressbar")).toBeVisible();
  await expect(sheet).toBeHidden(); // handed to Android's installer
});

test("Later closes the offer; the Home strip and the Me button stay", async ({ page }) => {
  await page.route("**/api.github.com/**", (r) => r.fulfill({ json: release(20) }));
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "App update" });
  await sheet.getByRole("button", { name: "Later" }).click();
  await expect(sheet).toBeHidden();

  const strip = page.getByRole("button", { name: /Version 1\.2\.20 is ready/ });
  await expect(strip).toBeVisible();
  await expect(page.getByRole("button", { name: "Update to version 1.2.20" })).toBeVisible(); // the arrows

  await tab(page, "Me");
  await expect(page.getByRole("button", { name: "Update to 1.2.20" })).toBeVisible();

  // Not offered again by itself for the same version, but still one tap away.
  await page.reload();
  await expect(page.getByRole("button", { name: /Version 1\.2\.20 is ready/ })).toBeVisible();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: /Version 1\.2\.20 is ready/ }).click();
  await expect(sheet.getByRole("button", { name: "Download and install" })).toBeVisible();
});

test("up to date: no strip, and the check says so", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("button", { name: /is ready/ })).toHaveCount(0);
  await tab(page, "Me");
  await page.getByRole("button", { name: "Check for updates" }).last().click();
  await expect(page.getByRole("dialog", { name: "App update" })).toContainText("You have the newest version (1.2.14)");
});

test("no internet: the check explains and can be tried again", async ({ page, consoleErrors }) => {
  let online = false;
  await page.route("**/api.github.com/**", (r) => (online ? r.fulfill({ json: release(20) }) : r.abort("internetdisconnected")));
  await openApp(page);
  await tab(page, "Me");
  await page.getByRole("button", { name: "Check for updates" }).last().click();
  const sheet = page.getByRole("dialog", { name: "App update" });
  await expect(sheet).toContainText("The update check did not work");
  online = true;
  await sheet.getByRole("button", { name: "Try again" }).click();
  await expect(sheet.getByRole("heading", { name: "Version 1.2.20 is ready" })).toBeVisible();
  consoleErrors.length = 0; // the failed request is the point of this test
});
