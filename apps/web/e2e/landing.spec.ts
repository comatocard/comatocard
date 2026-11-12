import { expect, type Page, test } from "@playwright/test";

const HERO = "Give your agents a card, not your wallet";

/** Opens the page below the intro without waiting for the video, like a keyboard user would. */
async function openPage(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible();
  await page.getByRole("button", { name: "Scroll" }).click();
  await expect(page.getByLabel("Example conversation")).toBeAttached();
}

test.describe("landing page", () => {
  test("opens on the hero, with the app one click away", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible();
    const cta = page.locator("header").getByRole("link", { name: "Open the app" });
    if (await cta.isVisible()) await expect(cta).toHaveAttribute("href", "/connect");
    // The page holds at one viewport until the intro is done.
    await expect(page.getByLabel("Example conversation")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("plays the card video on the first scroll, then opens the page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: HERO })).toBeVisible();
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 400);
    await expect(page.getByRole("heading", { name: "Fund Once" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel("Example conversation")).toBeAttached({ timeout: 12_000 });
  });

  test("never scrolls sideways, top to bottom", async ({ page }) => {
    await openPage(page);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("answers one question at a time", async ({ page }) => {
    await openPage(page);
    const first = page.getByRole("button", { name: "Who holds the money?" });
    const second = page.getByRole("button", { name: "Can an agent raise its own limit?" });
    await second.scrollIntoViewIfNeeded();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("A card key can only call pay. Limits")).toBeVisible();
  });

  test("states facts the repo backs, not stronger ones", async ({ page }) => {
    await openPage(page);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/audited/i);
    expect(text).toContain("1–2");
    expect(text).toContain("Testnet only. No real funds.");
  });
});
