import { expect, test } from "@playwright/test";

/**
 * Visual + geometric confirmation of the mobile fixes:
 *   1. Members/Teams header no longer collides
 *   2. The floating user quick-access control is present on mobile and absent
 *      on desktop
 */

test.describe("mobile fix verification", () => {
  test("phone: header geometry and FAB", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const orgId = page.url().split("/organization/")[1]?.split("/")[0];

    await page.goto(`/dashboard/organization/${orgId}/members`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3000);

    const g = await page.evaluate(() => {
      const header = document.querySelector("header");
      const tabs = Array.from(
        header?.querySelectorAll("[role='tab']") ?? [],
      ).map((t) => {
        const r = t.getBoundingClientRect();
        return {
          text: (t.textContent || "").trim(),
          left: Math.round(r.left),
          right: Math.round(r.right),
        };
      });
      const action = Array.from(
        header?.querySelectorAll("button") ?? [],
      ).filter(
        (b) =>
          b.getAttribute("role") !== "tab" &&
          !(b.textContent || "").includes("Toggle"),
      );
      const a = action.at(-1);
      const ar = a?.getBoundingClientRect();
      const fab = document.querySelector("[data-slot='mobile-user-fab']");
      const fr = fab?.getBoundingClientRect();
      return {
        tabs,
        action: a
          ? {
              text: (a.textContent || "").trim(),
              left: Math.round(ar?.left ?? 0),
            }
          : null,
        fab: fab
          ? {
              present: true,
              left: Math.round(fr?.left ?? 0),
              top: Math.round(fr?.top ?? 0),
              width: Math.round(fr?.width ?? 0),
              inViewport:
                (fr?.right ?? 0) <= window.innerWidth + 1 &&
                (fr?.bottom ?? 0) <= window.innerHeight + 1,
            }
          : { present: false },
      };
    });

    console.log("TABS  ", JSON.stringify(g.tabs));
    console.log("ACTION", JSON.stringify(g.action));
    console.log("FAB   ", JSON.stringify(g.fab));

    await page.screenshot({ path: "/tmp/fixed-members-mobile.png" });

    // The FAB must exist on mobile and be fully on screen.
    expect(g.fab.present, "mobile user FAB not rendered").toBeTruthy();
    expect(
      (g.fab as { inViewport?: boolean }).inViewport,
      "FAB is not fully inside the viewport",
    ).toBeTruthy();

    // And the collision must be gone.
    for (const t of g.tabs) {
      expect(
        t.right,
        `tab "${t.text}" still overlaps the action button`,
      ).toBeLessThanOrEqual((g.action?.left ?? 0) + 1);
    }
  });

  test("desktop: FAB is absent", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const visible = await page
      .locator("[data-slot='mobile-user-fab']")
      .isVisible()
      .catch(() => false);

    await page.screenshot({ path: "/tmp/fixed-desktop.png" });

    expect(
      visible,
      "floating user control should not appear on desktop (sidebar already shows it)",
    ).toBeFalsy();
  });
});
