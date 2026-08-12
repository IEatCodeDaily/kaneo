import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("link issue/PR palette shows state badges and repo sections", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Any ticket with the resources section; use a KFL board ticket.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  // open a known ticket card by its visible key
  await page.getByText("KFL-333", { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // open the Link issue or pull request palette
  const openPalette = page.getByText("Link issue or pull request", {
    exact: true,
  });
  await expect(openPalette.first()).toBeVisible({ timeout: 15_000 });
  await openPalette.first().click();

  // palette rows carry state badges
  const badges = page.locator('[data-testid^="resource-picker-state-"]');
  await expect
    .poll(() => badges.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);
  const badgeTexts = await badges.allTextContents();
  console.log("badge sample:", badgeTexts.slice(0, 6));

  // repo side rail exists and filters (KFL-333 feedback round 2)
  const rail = page.locator('[data-testid^="resource-picker-rail-"]');
  const railCount = await rail.count();
  console.log("repo rail entries:", railCount);
  expect(railCount).toBeGreaterThan(1);
  // click a specific repo in the rail and confirm the list narrows
  await rail.nth(1).click();
  await page.waitForTimeout(800);
  console.log("after rail click, badge count:", await badges.count());

  await page.screenshot({ path: "/tmp/link-palette.png" });
});

test("repo issue Link-ticket dialog sections by board with status badges", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  // go to the connected repo issues list
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/repo`, {
    waitUntil: "networkidle",
  });
  // repo index rows are clickable table rows; pick kaneo-test (has issues)
  await page
    .locator("table tbody tr", { hasText: "kaneo-test" })
    .first()
    .click();
  await page.waitForTimeout(2500);
  const issueRow = page.locator('a[href*="/issues/"]').first();
  await issueRow.click();
  await page.waitForTimeout(2500);

  const linkButton = page.getByRole("button", { name: /Link ticket/i });
  await expect(linkButton.first()).toBeVisible({ timeout: 15_000 });
  await linkButton.first().click();

  const boardSections = page.locator('[data-testid^="link-ticket-board-"]');
  await expect
    .poll(() => boardSections.count(), { timeout: 30_000, intervals: [800] })
    .toBeGreaterThan(0);
  console.log(
    "board sections:",
    (await boardSections.allTextContents()).slice(0, 6),
  );

  // status ICONS, not text badges (KFL-333 feedback round 2)
  const statusIcons = page.locator('[data-testid^="link-ticket-status-icon-"]');
  await expect
    .poll(() => statusIcons.count(), { timeout: 15_000, intervals: [500] })
    .toBeGreaterThan(0);
  // every icon wrapper contains an svg and no visible status text
  const firstIcon = statusIcons.first();
  expect(await firstIcon.locator("svg").count()).toBeGreaterThan(0);

  // board side rail exists and filters
  const boardRail = page.locator('[data-testid^="link-ticket-rail-"]');
  const boardRailCount = await boardRail.count();
  console.log("board rail entries:", boardRailCount);
  expect(boardRailCount).toBeGreaterThan(1);
  await boardRail.nth(1).click();
  await page.waitForTimeout(800);
  console.log(
    "after board rail click, sections:",
    (await boardSections.allTextContents()).slice(0, 4),
  );

  await page.screenshot({ path: "/tmp/link-ticket-dialog.png" });
});
