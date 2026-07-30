import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("AI chat toggle and provider config are managed in organization settings", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, "/dashboard/settings/organization/ai");

  // Discoverable from the organization settings nav, not just by URL.
  await expect(
    page.getByRole("link", { name: "AI", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AI", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("ai-chat-toggle")).toBeVisible();

  const secret = `sk-e2e-${Date.now()}`;
  await page
    .getByLabel("AI provider base URL")
    .fill("https://example.invalid/v1");
  await page.getByLabel("AI provider model").fill("e2e-model");
  await page.getByLabel("AI provider API key").fill(secret);
  await page.getByRole("button", { name: "Save provider" }).click();

  await expect(page.getByTestId("ai-key-state")).toHaveText(
    "(a key is stored)",
  );
  // The stored key must never come back to the browser.
  await expect(page.locator("body")).not.toContainText(secret);
  await expect(page.getByLabel("AI provider API key")).toHaveValue("");

  await page.reload();
  await expect(page.getByLabel("AI provider model")).toHaveValue("e2e-model");
  await expect(page.getByTestId("ai-key-state")).toHaveText(
    "(a key is stored)",
  );

  // Clean up so the org returns to instance-default provider config.
  await page.getByRole("button", { name: "Clear provider" }).click();
  await expect(page.getByTestId("ai-key-state")).toHaveText("(no key stored)");
  await expect(page.getByLabel("AI provider model")).toHaveValue("");

  expect(pageErrors).toEqual([]);
});
