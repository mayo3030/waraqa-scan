import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./app";

// Remove glare: ID cards are taken twice per side and the flash shine is taken out.

/** A made-up card on a dark table, photographed with a flash spot at (gx, gy) on the card. */
async function cardPhoto(page: Page, o: { dx: number; dy: number; gx: number; gy: number; back?: boolean }): Promise<Buffer> {
  const url = await page.evaluate((o) => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1200;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3b2a20"; g.fillRect(0, 0, 1600, 1200);
    g.translate(800 + o.dx, 600 + o.dy);
    const grad = g.createLinearGradient(-500, 0, 500, 0);
    grad.addColorStop(0, "#cfd9ea"); grad.addColorStop(1, "#e2d2ae");
    g.fillStyle = grad;
    g.beginPath(); g.roundRect(-500, -315, 1000, 630, 36); g.fill();
    g.fillStyle = "#4a4a52"; g.fillRect(-440, -230, 230, 290);
    g.fillStyle = "#1d1d24"; g.font = "bold 46px sans-serif";
    const lines = o.back ? ["ADDRESS 12 NILE ST", "VALID UNTIL 2031", "JOB ENGINEER"] : ["WARAQA TEST CARD", "NAME SAMPLE PERSON", "NO 1234 5678 90"];
    lines.forEach((t, i) => g.fillText(t, -160, -150 + i * 110));
    const glare = g.createRadialGradient(o.gx, o.gy, 0, o.gx, o.gy, 170);
    glare.addColorStop(0, "rgba(255,255,255,1)"); glare.addColorStop(0.4, "rgba(255,255,255,1)"); glare.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glare;
    g.beginPath(); g.roundRect(-500, -315, 1000, 630, 36); g.fill();
    return c.toDataURL("image/jpeg", 0.93);
  }, o);
  return Buffer.from(url.split(",")[1], "base64");
}

/** Mean brightness of a 24 px square of the page preview, at (fx, fy) as parts of its size. */
const spot = (page: Page, fx: number, fy: number) =>
  page.locator(".filter-stage canvas").evaluate((c: HTMLCanvasElement, [fx, fy]) => {
    const g = c.getContext("2d")!;
    const d = g.getImageData(Math.round(c.width * fx) - 12, Math.round(c.height * fy) - 12, 24, 24).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }, [fx, fy]);

async function openIdCards(page: Page, glareOff = false) {
  await openApp(page);
  await page.getByRole("button", { name: "ID Cards" }).click();
  const intro = page.getByRole("dialog", { name: "ID cards" });
  const sw = intro.getByRole("checkbox", { name: /Remove glare/ });
  await expect(sw).toBeChecked();
  if (glareOff) await sw.uncheck();
  await intro.getByRole("button", { name: "Make it now" }).click();
}

test("the camera asks for two photos of each side", async ({ page }) => {
  await openIdCards(page);
  const shutter = page.getByRole("button", { name: "Take photo" });
  for (const prompt of ["Front side inside the frame (1 of 2)", "Same side again, tilt the phone a little (2 of 2)", "Back side inside the frame (1 of 2)", "Same side again, tilt the phone a little (2 of 2)"]) {
    await expect(page.getByText(prompt, { exact: true })).toBeVisible({ timeout: 30_000 });
    await shutter.click();
  }
  for (const save of ["Save, next photo", "Save page"]) {
    await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: save }).click();
  }
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /^Page \d$/ })).toHaveCount(1);
});

test("two photos with the shine in different places become one clean card", async ({ page }) => {
  await openIdCards(page);
  // Front: shine lower right, then (phone tilted) over the face photo. Back: the same, card moved a little.
  const files = [
    await cardPhoto(page, { dx: 0, dy: 0, gx: 330, gy: 200 }),
    await cardPhoto(page, { dx: 14, dy: -9, gx: -325, gy: -100 }),
    await cardPhoto(page, { dx: -6, dy: 4, gx: 330, gy: 200, back: true }),
    await cardPhoto(page, { dx: 8, dy: 10, gx: -325, gy: -100, back: true }),
  ];
  await page.locator("#cam-import").setInputFiles(files.map((buffer, i) => ({ name: `card-${i}.jpg`, mimeType: "image/jpeg", buffer })));
  for (const save of ["Save, next photo", "Save page"]) {
    await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Clean up" })).toBeVisible();
    await page.getByRole("radio", { name: "Original" }).click();
    await expect(page.locator(".filter-stage canvas")).toBeVisible();
    await page.waitForTimeout(300);
    // Where each photo had its shine: the card colour (about 214) and the dark face box (about 74).
    const a = await spot(page, 0.83, 0.82), b = await spot(page, 0.175, 0.34);
    expect(a, "shine on the card removed").toBeLessThan(230);
    expect(b, "shine on the face photo removed").toBeLessThan(110);
    await expect(page.getByRole("note")).toHaveCount(0);
    await page.getByRole("button", { name: save }).click();
  }
  await expect(page.getByRole("button", { name: "Page 1", exact: true })).toBeVisible({ timeout: 90_000 });
});

test("with Remove glare off, a card with flash glare gets a tip", async ({ page }) => {
  await openIdCards(page, true);
  const files = [
    await cardPhoto(page, { dx: 0, dy: 0, gx: 250, gy: -150 }),
    await cardPhoto(page, { dx: 0, dy: 0, gx: 2000, gy: 2000, back: true }),
  ];
  await page.locator("#cam-import").setInputFiles(files.map((buffer, i) => ({ name: `card-${i}.jpg`, mimeType: "image/jpeg", buffer })));
  await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Page found. Drag a corner if it is off.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("note")).toContainText("Flash glare on the card");
  await page.getByRole("button", { name: "Save, next photo" }).click();
  await expect(page.getByRole("heading", { name: "Adjust corners" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Clean up" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("note")).toHaveCount(0);
});
