import { expect, test } from "@playwright/test";

const url =
  "/dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/board/yiw0az2cmtbz18035a6jdme3/task/bwk0ubsiq79mnpm4r2slz2ta";

test("canonical synced issue is a task property, not a generic Resource", async ({
  page,
}) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const properties = page.locator('[data-slot="task-properties-sidebar"]');
  const syncedIssue = properties.locator(
    'a:visible[aria-label*="kaneo-board-sync-beta-20260728082814 #4"]',
  );
  await expect(syncedIssue).toBeVisible();
  await expect(syncedIssue).toHaveAttribute(
    "href",
    "https://github.com/IEatCodeDaily/kaneo-board-sync-beta-20260728082814/issues/4",
  );

  const resources = page.locator('[data-slot="task-resources"]');
  await expect(resources.getByRole("link", { name: /#4/i })).toHaveCount(0);
});

test("synced issue property remains visible on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  await expect(
    page.locator(
      '[data-slot="task-properties-sidebar"] a:visible[aria-label*="kaneo-board-sync-beta-20260728082814 #4"]',
    ),
  ).toBeVisible();
});
