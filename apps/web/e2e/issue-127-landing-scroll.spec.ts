import { expect, test } from "@playwright/test";

/**
 * Issue 127: once the intro was done the page would not scroll. The wheel moved the window, but
 * body had become its own scroll container, so the window never moved.
 */
test("issue 127: the wheel scrolls the page once the intro is done", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Scroll" }).click();
  await expect(page.getByLabel("Example conversation")).toBeAttached();
  await page.mouse.move(200, 300);
  // Keep turning the wheel until the window has moved, or give up after a few seconds.
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, 500);
        return page.evaluate(() => window.scrollY);
      },
      { timeout: 8000 },
    )
    .toBeGreaterThan(800);
  expect(await page.evaluate(() => document.body.scrollTop)).toBe(0);
});
