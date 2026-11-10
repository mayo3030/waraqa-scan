import type { Page } from "@playwright/test";
import { expect, fixture, openApp, release, releases, tab, test } from "./app";

// On Android the app draws behind the status bar and the navigation bar, and Capacitor
// tells the page how tall they are through these CSS variables. Nothing the person reads
// or taps may sit under either bar, on any screen.
const TOP = 36, BOTTOM = 48;

async function withSystemBars(page: Page) {
  await page.addInitScript(([t, b]) => {
    const set = () => {
      document.documentElement.style.setProperty("--safe-area-inset-top", t + "px");
      document.documentElement.style.setProperty("--safe-area-inset-bottom", b + "px");
    };
    if (document.documentElement) set();
    document.addEventListener("DOMContentLoaded", set);
  }, [TOP, BOTTOM]);
}

/** Controls and headings found under the bars. Empty when the screen is laid out correctly. */
function underBars(page: Page): Promise<string[]> {
  return page.evaluate(([top, bottom]) => {
    const sel = "button, a[href], input, select, textarea, label, [role=tab], [role=radio], [role=button], h1, h2, h3";
    const hit = new Set<string>();
    const H = innerHeight, W = innerWidth;
    const ys: number[] = [];
    for (let y = 1; y < top; y += 5) ys.push(y);
    for (let y = H - bottom + 1; y < H; y += 5) ys.push(y);
    for (const y of ys) for (let x = 3; x < W; x += 6) {
      const el = document.elementFromPoint(x, y)?.closest(sel);
      if (el) hit.add(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28)}" ${y < top ? "under the status bar" : "under the navigation bar"}`);
    }
    return [...hit].slice(0, 6);
  }, [TOP, BOTTOM]);
}

async function clear(page: Page, screen: string) {
  await page.waitForTimeout(350); // entrance animation
  expect(await underBars(page), screen).toEqual([]);
}

test("the four tabs and their sheets stay clear of the system bars", async ({ page }) => {
  await withSystemBars(page);
  await openApp(page);
  await clear(page, "Home");
  // The bottom tabs end where the navigation bar begins.
  const tabs = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
  expect(Math.round(tabs.y + tabs.height)).toBe(844 - BOTTOM);

  await tab(page, "All Documents");
  await clear(page, "All Documents");
  await page.getByRole("button", { name: "Select" }).click();
  await page.getByRole("button", { name: /Sample: bill of sale/ }).click();
  await clear(page, "All Documents, selecting");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await clear(page, "Delete question");
  await page.getByRole("button", { name: "Keep them" }).click();
  await page.getByRole("button", { name: "Stop selecting" }).click();
  await page.getByRole("button", { name: "Sort" }).click();
  await clear(page, "Sort sheet");
  await page.getByRole("button", { name: "Name" }).click();

  await tab(page, "Tools");
  await clear(page, "Tools");
  await tab(page, "Me");
  await clear(page, "Me");
});

test("scanning screens stay clear of the system bars and the photo fits with all four corners in reach", async ({ page }) => {
  await withSystemBars(page);
  await openApp(page);
  await page.getByLabel("Import Images").setInputFiles((await import("./app")).PHOTO);
  await expect(page.getByText(/Page found/)).toBeVisible({ timeout: 60_000 });
  await clear(page, "Adjust corners");
  const corners = page.getByRole("button", { name: /^Corner \d$/ });
  await expect(corners).toHaveCount(4);
  for (const c of await corners.all()) {
    const b = (await c.boundingBox())!;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    expect(cx, "corner is on the screen, with room for a finger").toBeGreaterThan(14);
    expect(cx).toBeLessThan(390 - 14);
    expect(cy).toBeGreaterThan(TOP + 56);
    expect(cy).toBeLessThan(844 - BOTTOM - 60);
  }
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Clean up" })).toBeVisible();
  await clear(page, "Clean up");
  await page.getByRole("button", { name: "Save page" }).click();
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 60_000 });
  await clear(page, "Document");

  for (const sheet of ["PDF", "Text", "Tools"]) {
    await page.getByRole("button", { name: sheet, exact: true }).click();
    await clear(page, sheet + " sheet");
    const top = (await page.getByRole("dialog").boundingBox())!.y;
    expect(top, sheet + " sheet starts below the status bar").toBeGreaterThanOrEqual(TOP);
    await page.getByRole("button", { name: "Close" }).click();
  }
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await clear(page, "Page sheet");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await clear(page, "Sign");
});

test("the camera and its sheets stay clear of the system bars", async ({ page }) => {
  await withSystemBars(page);
  await openApp(page);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
  await clear(page, "Camera");
  await page.getByRole("tab", { name: "ID Cards" }).click();
  await clear(page, "ID Cards explainer");
  await page.getByRole("button", { name: "All Features" }).click();
  await clear(page, "All features");
  await page.getByRole("dialog", { name: "All features" }).getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await clear(page, "Camera settings");
});

test("the update sheet and the Home strip stay clear of the system bars", async ({ page }) => {
  await withSystemBars(page);
  await page.route("**/api.github.com/**", (r) => r.fulfill({ json: releases(release(20), release(14)) }));
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "App update" })).toBeVisible();
  await clear(page, "Update sheet");
  await page.getByRole("button", { name: "Later" }).click();
  await clear(page, "Home with the update strip");
});

test("a tall card is found in a hand and fits both scanning screens", async ({ page }) => {
  await withSystemBars(page);
  await openApp(page);
  await page.getByLabel("Import Images").setInputFiles(fixture("photo-hand-1.jpg"));
  await expect(page.getByText(/Page found/)).toBeVisible({ timeout: 60_000 });
  // The corners sit on the card, not out on the thumb that covers its edge.
  const stage = page.locator("canvas").first();
  const img = (await stage.boundingBox())!;
  const at = async (n: number) => {
    const b = (await page.getByRole("button", { name: `Corner ${n}` }).boundingBox())!;
    return { x: (b.x + b.width / 2 - img.x) / img.width, y: (b.y + b.height / 2 - img.y) / img.height };
  };
  // Where the card's corners are in the photo, as fractions of its width and height.
  const truth = [[300 / 1500, 370 / 2000], [1180 / 1500, 330 / 2000], [1230 / 1500, 1660 / 2000], [330 / 1500, 1700 / 2000]];
  for (let i = 0; i < 4; i++) {
    const c = await at(i + 1);
    expect(Math.abs(c.x - truth[i][0]), `corner ${i + 1} across`).toBeLessThan(0.02);
    expect(Math.abs(c.y - truth[i][1]), `corner ${i + 1} down`).toBeLessThan(0.02);
  }
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Clean up" })).toBeVisible();
  const preview = page.locator("canvas").first();
  await expect(preview).toBeVisible();
  await page.waitForTimeout(600);
  const p = (await preview.boundingBox())!;
  const filters = (await page.getByRole("radiogroup", { name: "Filter" }).boundingBox())!;
  expect(p.y, "preview starts below the top bar").toBeGreaterThan(TOP + 40);
  expect(p.y + p.height, "the whole page shows above the filters").toBeLessThanOrEqual(filters.y);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(390);
});
