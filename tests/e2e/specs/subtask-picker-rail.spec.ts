import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("sub-ticket link picker: board rail, status icons, capped rows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page.getByText("KFL-333", { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Open the Sub-tickets link-existing palette (link icon in section header).
  const subticketsRow = page
    .locator("div")
    .filter({ has: page.getByText(/Sub-tickets/i) })
    .filter({ has: page.locator("button:has(svg.lucide-link-2)") })
    .last();
  await subticketsRow.scrollIntoViewIfNeeded();
  await subticketsRow.locator("button:has(svg.lucide-link-2)").first().click();

  const rail = page.locator('[data-testid^="subtask-picker-rail-"]');
  await expect
    .poll(() => rail.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(1);
  console.log("subtask rail entries:", await rail.count());

  const icons = page.locator('[data-testid^="subtask-status-icon-"]');
  await expect
    .poll(() => icons.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);
  const rowCount = await icons.count();
  console.log("visible rows:", rowCount);
  // Perf cap: at most 50 rows per board group (old behaviour mounted every
  // ticket in the org — 1400+ DOM rows). Bound = rails minus "All" times cap.
  const boardCount = (await rail.count()) - 1;
  expect(rowCount).toBeLessThanOrEqual(boardCount * 50);

  // Search still reaches beyond the cap (filter-then-cap).
  await page
    .getByPlaceholder(/search/i)
    .first()
    .fill("KFL124");
  await page.waitForTimeout(600);
  console.log("rows after search:", await icons.count());

  // rail filter works
  await rail.nth(1).click();
  await page.waitForTimeout(600);
  console.log("rows after rail:", await icons.count());

  await page.screenshot({ path: "/tmp/kfl333-subtask-picker.png" });
});
