import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("AI chat resizes and preserves its dimensions", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/board`,
  );

  await page
    .getByRole("button", { name: "Open organization AI assistant" })
    .click();
  const panel = page.getByTestId("ai-chat-panel");
  await expect(panel).toBeVisible();
  const before = await panel.boundingBox();
  if (!before) throw new Error("AI chat panel has no bounding box");

  // Chromium exposes CSS `resize` from the bottom-right corner.
  await page.mouse.move(
    before.x + before.width - 2,
    before.y + before.height - 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width + 120,
    before.y + before.height + 80,
    {
      steps: 8,
    },
  );
  await page.mouse.up();

  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 80);
  const resized = await panel.boundingBox();
  if (!resized) throw new Error("Resized AI chat panel has no bounding box");

  await page.reload();
  await page
    .getByRole("button", { name: "Open organization AI assistant" })
    .click();
  const restored = await page.getByTestId("ai-chat-panel").boundingBox();
  if (!restored) throw new Error("Restored AI chat panel has no bounding box");
  expect(restored.width).toBeCloseTo(resized.width, 0);
  expect(restored.height).toBeCloseTo(resized.height, 0);

  expect(pageErrors).toEqual([]);
});

test("AI chat remains viewport-safe on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/board`,
  );
  await page
    .getByRole("button", { name: "Open organization AI assistant" })
    .click();
  const box = await page.getByTestId("ai-chat-panel").boundingBox();
  if (!box) throw new Error("Mobile AI chat panel has no bounding box");
  expect(box.width).toBeLessThanOrEqual(390 - 32);
  expect(box.height).toBeLessThanOrEqual(700 - 40);
});
