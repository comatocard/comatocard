import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("opens on the promise and sends people to the app", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Give your agents a card, not your wallet." }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: "Open the app" }).first();
    await expect(cta).toHaveAttribute("href", "/connect");
    await cta.click();
    await expect(page).toHaveURL(/\/connect$/);
    expect(errors).toEqual([]);
  });

  test("never scrolls sideways, top to bottom", async ({ page }) => {
    await page.goto("/");
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

  test("reveals every section as it scrolls in", async ({ page }) => {
    await page.goto("/");
    for (const name of [
      "Fund it once. Let every agent spend its share.",
      "Set it up once",
      "Change limits in plain words.",
    ]) {
      const heading = page.getByRole("heading", { name });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toHaveCSS("opacity", "1");
    }
    await page.getByText("Testnet only. No real funds.").scrollIntoViewIfNeeded();
    await expect(page.getByText("Testnet only. No real funds.")).toBeVisible();
  });

  test("answers one question at a time", async ({ page }) => {
    await page.goto("/");
    const first = page.getByRole("button", { name: "Who holds the money?" });
    const second = page.getByRole("button", { name: "Can an agent raise its own limit?" });
    await second.scrollIntoViewIfNeeded();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await second.click();
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("A card key can only call pay.")).toBeVisible();
  });

  test("states facts the repo backs, not stronger ones", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Rendered text only: textContent would also read the inline scripts.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/audited/i);
    expect(text).toContain("Reviewed contract");
    expect(text).toContain("1–2");
  });
});
