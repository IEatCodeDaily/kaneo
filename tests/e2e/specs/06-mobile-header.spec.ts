import { expect, test } from "@playwright/test";

/**
 * Regression guard for the mobile header collision (board task #5).
 *
 * Bug: on the Members/Teams page at a phone viewport, the `teams` tab pill is
 * painted over by the header action button ("Invite member" / "New team"), so
 * the tab is unreadable and unclickable. The boards header is unaffected because
 * it has no tab group.
 *
 * These assertions measure the box model rather than eyeballing a screenshot —
 * an overlay scrollbar or a stacking-order collision is invisible to a snapshot
 * but obvious in geometry.
 */

const PHONE = { width: 390, height: 844 };

type Box = { left: number; right: number; width: number };

async function headerGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) throw new Error("header not found");

    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      };
    };

    const tablist = header.querySelector("[role='tablist']");
    const tabs = Array.from(header.querySelectorAll("[role='tab']"));

    // The action button is the last header button that is not a tab and not the
    // sidebar trigger.
    const actionButtons = Array.from(header.querySelectorAll("button")).filter(
      (b) =>
        b.getAttribute("role") !== "tab" &&
        !(b.textContent || "").includes("Toggle") &&
        !b.hasAttribute("data-sidebar"),
    );
    const action = actionButtons.at(-1) ?? null;

    return {
      viewportWidth: window.innerWidth,
      header: box(header),
      tablist: tablist
        ? {
            ...box(tablist),
            scrollWidth: (tablist as HTMLElement).scrollWidth,
            clientWidth: (tablist as HTMLElement).clientWidth,
          }
        : null,
      tabs: tabs.map((t) => ({
        ...box(t),
        text: (t.textContent || "").trim(),
      })),
      action: action
        ? { ...box(action), text: (action.textContent || "").trim() }
        : null,
    };
  });
}

test.describe("mobile header layout", () => {
  test.use({ viewport: PHONE });

  for (const [label, search] of [
    ["members", ""],
    ["teams", "?tab=teams"],
  ] as const) {
    test(`${label} tab group does not collide with the header action`, async ({
      page,
    }) => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const orgId = page.url().split("/organization/")[1]?.split("/")[0];
      expect(orgId, "could not resolve organization id").toBeTruthy();

      await page.goto(`/dashboard/organization/${orgId}/members${search}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(3000);

      const g = await headerGeometry(page);

      // Guard against a vacuous pass: the elements under test must exist.
      expect(g.tablist, "no tablist rendered").not.toBeNull();
      expect(g.tabs.length, "expected members + teams tabs").toBeGreaterThan(1);
      expect(g.action, "no header action button rendered").not.toBeNull();

      const tablist = g.tablist as NonNullable<typeof g.tablist>;
      const action = g.action as NonNullable<typeof g.action>;

      // 1. The tab group must not be clipped: every tab has to be readable.
      expect(
        tablist.scrollWidth,
        `tab group is clipped (scrollWidth ${tablist.scrollWidth} > clientWidth ${tablist.clientWidth}); tabs are cut off`,
      ).toBeLessThanOrEqual(tablist.clientWidth + 1);

      // 2. No tab may be overlapped by the action button. This is the actual
      //    user-visible failure: the button paints over the `teams` pill.
      for (const tab of g.tabs) {
        expect(
          tab.right,
          `tab "${tab.text}" (ends x=${tab.right}) is overlapped by action "${action.text}" (starts x=${action.left})`,
        ).toBeLessThanOrEqual(action.left + 1);
      }

      // 3. Every tab must sit inside the viewport.
      for (const tab of g.tabs) {
        expect(
          tab.left,
          `tab "${tab.text}" starts off-screen at x=${tab.left}`,
        ).toBeGreaterThanOrEqual(-1);
        expect(
          tab.right,
          `tab "${tab.text}" extends past the viewport (x=${tab.right} > ${g.viewportWidth})`,
        ).toBeLessThanOrEqual(g.viewportWidth + 1);
      }

      // 4. The action button must stay inside the viewport too.
      expect(
        action.right,
        `action "${action.text}" overflows the viewport (x=${action.right})`,
      ).toBeLessThanOrEqual(g.viewportWidth + 1);
    });
  }

  test("teams tab is actually clickable on mobile", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const orgId = page.url().split("/organization/")[1]?.split("/")[0];

    await page.goto(`/dashboard/organization/${orgId}/members`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    const teamsTab = page.locator("[role='tab']", { hasText: /^teams$/i });
    await expect(teamsTab).toBeVisible();

    // A pill painted over by the action button fails this: Playwright refuses to
    // click an element obscured at its hit point.
    await teamsTab.click({ timeout: 8000 });
    await page.waitForTimeout(1500);

    await expect(teamsTab).toHaveAttribute("aria-selected", "true");
  });
});
