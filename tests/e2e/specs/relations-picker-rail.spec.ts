import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("relations link picker has a board rail that filters", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page.getByText("KFL-333", { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Open the Relations palette: the ghost plus Button sitting in the same
  // header row as the "Relations" collapsible trigger.
  const relationsRow = page
    .locator("div")
    .filter({ has: page.getByText("Relations", { exact: true }) })
    .filter({ has: page.locator("button:has(svg.lucide-plus)") })
    .last();
  await relationsRow.scrollIntoViewIfNeeded();
  await relationsRow.locator("button:has(svg.lucide-plus)").first().click();

  const rail = page.locator('[data-testid^="relation-picker-rail-"]');
  await expect
    .poll(() => rail.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(1);
  console.log("relation rail entries:", await rail.count());

  // status icons still render in rows
  const rows = page.locator('[data-slot="command-item"]');
  await expect
    .poll(() => rows.count(), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(0);

  // rail filter narrows groups
  await rail.nth(2).click();
  await page.waitForTimeout(800);
  const groups = page.locator('[data-slot="command-group-label"]');
  console.log(
    "after rail click, groups:",
    (await groups.allTextContents()).slice(0, 4),
  );

  // containment: scroller ends inside popup
  const containment = await page.evaluate(() => {
    const popupEl = document.querySelector(
      '[data-slot="command-dialog-popup"]',
    );
    if (!popupEl) return null;
    const popupRect = popupEl.getBoundingClientRect();
    let scroller: Element | null = null;
    for (const el of popupEl.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.querySelector('[data-slot="command-item"]')
      ) {
        scroller = el;
        break;
      }
    }
    return {
      hasScroller: Boolean(scroller),
      scrollerBottom: scroller?.getBoundingClientRect().bottom ?? null,
      popupBottom: popupRect.bottom,
    };
  });
  console.log("containment:", JSON.stringify(containment));
  if (!containment) throw new Error("popup vanished");
  expect(containment.hasScroller).toBe(true);
  if (containment.scrollerBottom !== null) {
    expect(containment.scrollerBottom).toBeLessThanOrEqual(
      containment.popupBottom + 1,
    );
  }

  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/kfl333-relations-rail.png" });
});
