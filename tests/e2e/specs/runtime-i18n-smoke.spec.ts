import { expect, test } from "@playwright/test";

test("production app boots without locale runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  const response = await page.goto("https://kaneo.entelechia.cloud", {
    waitUntil: "networkidle",
  });

  expect(response?.status()).toBeLessThan(400);
  await expect.poll(() => errors, { timeout: 15_000 }).toEqual([]);
  await expect(page.locator("body")).not.toBeEmpty({ timeout: 15_000 });
  await page.screenshot({ path: "/tmp/kaneo-i18n-fixed.png", fullPage: true });
});
