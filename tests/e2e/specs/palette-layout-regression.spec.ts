import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("palette layout: results render in the right pane, not under the rail", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page.getByText("KFL-333", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page
    .getByText("Link issue or pull request", { exact: true })
    .first()
    .click();

  const badges = page.locator('[data-testid^="resource-picker-state-"]');
  await expect
    .poll(() => badges.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);

  // GEOMETRY ASSERTION: the results list must sit to the RIGHT of the rail,
  // not below it (the reported regression).
  const rail = page.locator('[data-testid="resource-picker-rail-all"]');
  const railBox = await rail.boundingBox();
  const firstRow = badges.first();
  const rowBox = await firstRow.boundingBox();
  console.log("rail x:", railBox?.x, "row x:", rowBox?.x);
  if (!railBox || !rowBox) throw new Error("missing boxes");
  expect(rowBox.x).toBeGreaterThan(railBox.x + railBox.width - 5);

  // And the dialog must visually contain the row (no overflow past popup).
  const popup = page.locator('[data-slot="command-dialog-popup"]');
  const popupBox = await popup.boundingBox();
  if (!popupBox) throw new Error("missing popup box");
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(
    popupBox.y + popupBox.height + 1,
  );

  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/kfl333-palette-fixed.png" });
});
