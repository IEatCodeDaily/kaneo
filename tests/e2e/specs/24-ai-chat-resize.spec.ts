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

  await expect(panel).toContainText("Alpha");
  const handle = page.getByRole("button", { name: "Resize AI assistant" });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("AI chat resize handle has no bounding box");
  expect(handleBox.x - before.x).toBeLessThanOrEqual(2);
  expect(handleBox.y - before.y).toBeLessThanOrEqual(2);

  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y - 80, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 80);
  const resized = await panel.boundingBox();
  if (!resized) throw new Error("Resized AI chat panel has no bounding box");

  // No observer should feed measurements back into state after the drag ends.
  await page.waitForTimeout(500);
  const settled = await panel.boundingBox();
  if (!settled) throw new Error("Settled AI chat panel has no bounding box");
  expect(settled.width).toBeCloseTo(resized.width, 0);
  expect(settled.height).toBeCloseTo(resized.height, 0);

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
