import AxeBuilder from "@axe-core/playwright";
import { expect, openApp, tab, test } from "./app";

test("the four tabs open and show their content", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("button", { name: "Smart Scan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recents" })).toBeVisible();

  await tab(page, "All Documents");
  await expect(page.getByRole("heading", { name: /All/ })).toContainText("(1)");
  await expect(page.getByRole("button", { name: "Create Folder" })).toBeVisible();

  await tab(page, "Tools");
  await expect(page.getByRole("heading", { name: "Tools", exact: true })).toBeVisible();
  for (const g of ["Scan", "Import", "Convert", "Edit", "Utilities"]) await expect(page.getByRole("heading", { name: g, exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Tool groups" }).getByRole("button", { name: "Utilities" }).click();
  await expect(page.getByRole("button", { name: "CountCam" })).toBeInViewport();

  await tab(page, "Me");
  await expect(page.getByText(/^Version \d/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for updates" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Back up all documents" })).toBeEnabled();
});

test("the floating scan button opens the camera and it closes again", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Scan", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Close camera" }).click();
  await expect(page.getByRole("heading", { name: "Recents" })).toBeVisible();
});

for (const scheme of ["dark", "light"] as const) {
  test(`no serious accessibility problems on the main screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    for (const t of ["Home", "All Documents", "Tools", "Me"] as const) {
      await tab(page, t);
      await page.waitForTimeout(400); // entrance animation
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(bad.map((v) => `${t}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 90)}`), `${t} in ${scheme}`).toEqual([]);
    }
  });
}

test("the layout holds on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openApp(page);
  for (const t of ["Home", "All Documents", "Tools", "Me"] as const) {
    await tab(page, t);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide, `${t} scrolls sideways at 320px`).toBe(false);
  }
});
