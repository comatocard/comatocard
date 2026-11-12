import { expect, type Page, test } from "@playwright/test";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** Console errors the app itself raised; third-party wallet scripts are not ours to fail on. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("connect screen", () => {
  test("shows the pitch and a way to connect", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Cards your agents/ })).toBeVisible();
    await expect(page.getByText("Limits live on chain. You hold the keys.")).toBeVisible();
    if (isPhone(page)) {
      await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeHidden();
    } else {
      await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
      for (const wallet of ["Meteor Wallet", "HOT Wallet", "MyNearWallet", "Other wallets"]) {
        await expect(page.getByRole("button", { name: wallet })).toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  });

  test("never scrolls sideways", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Cards your agents/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("keeps the long explanation behind the info tip", async ({ page }) => {
    await page.goto("/");
    const tip = page.getByRole("button", { name: "About Wallets" }).locator("visible=true");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await tip.first().click();
    await expect(page.getByRole("tooltip")).toContainText("Testnet only");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("settles the card in even with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const card = page.locator("main [aria-hidden=true] .aspect-\\[1\\.586\\]").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS("opacity", "1");
  });
});

test("setup without a wallet goes back to connect", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /Cards your agents/ })).toBeVisible();
});
