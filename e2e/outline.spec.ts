import { expect, openApp, test } from "./app";

// The live page outline, with a camera that films a photo of a page on a table
// (the "page-camera" project in playwright.config.ts).

test("the page edges are drawn live and turn green when the page holds still", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  const outline = page.locator("svg.cam-outline");
  await expect(outline).toBeVisible({ timeout: 45_000 });
  // Four corners, around the page in the middle of the picture, not the whole screen.
  const corners = await outline.locator("circle").evaluateAll((cs) => cs.map((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]));
  expect(corners).toHaveLength(4);
  const [, , bw, bh] = ((await outline.getAttribute("viewBox")) ?? "").split(" ").map(Number);
  const box = { width: bw, height: bh };
  const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  expect(w / box.width).toBeGreaterThan(0.5);
  expect(h / box.height).toBeGreaterThan(0.5);
  expect(Math.min(...ys)).toBeGreaterThan(0);
  expect(Math.max(...ys)).toBeLessThan(box.height);
  await expect(outline).toHaveAttribute("data-state", "steady", { timeout: 15_000 });
});

test("Auto capture takes a steady page once, then waits for the next page", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "Auto capture off" }).click();
  await expect(page.getByRole("button", { name: "Auto capture on" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 taken. Put the next page in view")).toBeVisible({ timeout: 45_000 });
  // The same page stays in view: no second photo.
  await page.waitForTimeout(4000);
  await expect(page.getByText("1 taken. Put the next page in view")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Page found. Drag a corner if it is off.")).toBeVisible({ timeout: 60_000 });
});

test("with Live page outline off, nothing is drawn", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("waraqa-prefs", JSON.stringify({ outline: false })));
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(page.locator("svg.cam-outline")).toHaveCount(0);
});
