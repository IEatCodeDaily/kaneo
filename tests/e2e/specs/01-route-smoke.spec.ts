import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Route smoke coverage. Every authenticated route renders with zero runtime
 * errors. This is the net that catches "X is not defined" regressions — a
 * production build succeeds with those, so only real page loads reveal them.
 */
const staticRoutes = [
  "/dashboard",
  "/dashboard/invitations",
  "/dashboard/settings",
  "/dashboard/settings/account",
  "/dashboard/settings/account/information",
  "/dashboard/settings/account/preferences",
  "/dashboard/settings/account/notifications",
  "/dashboard/settings/account/developer",
  "/dashboard/settings/account/github",
  "/dashboard/settings/connections",
  "/dashboard/settings/organization",
  "/dashboard/settings/organization/general",
  "/dashboard/settings/organization/features",
  "/dashboard/settings/organization/github",
  "/dashboard/settings/organization/labels",
  "/dashboard/settings/organization/roles",
  "/dashboard/settings/boards",
];

test.describe("route smoke", () => {
  for (const route of staticRoutes) {
    test(`renders ${route}`, async ({ page, pageErrors }) => {
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
      });
      expect(
        response?.status(),
        `${route} returned ${response?.status()}`,
      ).toBeLessThan(400);
      await expect(page.locator("body")).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      // A crashed React tree leaves an effectively empty body.
      const text = (await page.locator("body").innerText()).trim();
      expect(text.length, `${route} rendered no content`).toBeGreaterThan(0);
      expect(pageErrors).toEqual([]);
    });
  }

  test("renders organization scoped routes", async ({ page, pageErrors }) => {
    const org = fixtures.organizationId;
    for (const route of [
      `/dashboard/organization/${org}`,
      `/dashboard/organization/${org}/members`,
      `/dashboard/organization/${org}/repo`,
      `/dashboard/organization/${org}/search`,
    ]) {
      await gotoAndSettle(page, route);
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors, `errors on ${route}`).toEqual([]);
    }
  });

  test("renders board views", async ({ page, pageErrors }) => {
    test.skip(!fixtures.boardId, "no board fixture available");
    const base = `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}`;
    for (const route of [`${base}/board`, `${base}/backlog`, `${base}/gantt`]) {
      await gotoAndSettle(page, route);
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors, `errors on ${route}`).toEqual([]);
    }
  });

  test("renders repo tabs", async ({ page, pageErrors }) => {
    test.skip(!fixtures.repoId, "no repo fixture available");
    const base = `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}`;
    for (const route of [
      base,
      `${base}/code`,
      `${base}/issues`,
      `${base}/pulls`,
      `${base}/releases`,
      `${base}/packages`,
    ]) {
      await gotoAndSettle(page, route);
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors, `errors on ${route}`).toEqual([]);
    }
  });
});
