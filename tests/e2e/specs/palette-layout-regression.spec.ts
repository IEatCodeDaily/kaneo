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

  // All-view: both kinds visible with their type icons.
  const issueIcons = page.locator(
    '[data-testid^="resource-picker-kind-issue-"]',
  );
  const prIcons = page.locator('[data-testid^="resource-picker-kind-pr-"]');
  console.log(
    "all view — issues:",
    await issueIcons.count(),
    "prs:",
    await prIcons.count(),
  );
  expect(await issueIcons.count()).toBeGreaterThan(0);
  expect(await prIcons.count()).toBeGreaterThan(0);

  // Toggling to PRs-only removes issue rows.
  await page.getByTestId("resource-filter-pull-requests").click();
  await page.waitForTimeout(800);
  console.log(
    "pr view — issues:",
    await issueIcons.count(),
    "prs:",
    await prIcons.count(),
  );
  expect(await issueIcons.count()).toBe(0);
  expect(await prIcons.count()).toBeGreaterThan(0);
  await page.getByTestId("resource-filter-all").click();
  await page.waitForTimeout(500);

  // GEOMETRY ASSERTION: the results list must sit to the RIGHT of the rail,
  // not below it (the reported regression).
  const rail = page.locator('[data-testid="resource-picker-rail-all"]');
  const railBox = await rail.boundingBox();
  const firstRow = badges.first();
  const rowBox = await firstRow.boundingBox();
  console.log("rail x:", railBox?.x, "row x:", rowBox?.x);
  if (!railBox || !rowBox) throw new Error("missing boxes");
  expect(rowBox.x).toBeGreaterThan(railBox.x + railBox.width - 5);

  // CONTAINMENT: the scroll container itself must fit inside the popup and
  // actually scroll (clip) its content. Row bounding boxes are useless here:
  // rows scrolled out of view legitimately report rects beyond the popup.
  const popup = page.locator('[data-slot="command-dialog-popup"]');
  const popupBox = await popup.boundingBox();
  if (!popupBox) throw new Error("missing popup box");
  const containment = await page.evaluate(() => {
    const popupEl = document.querySelector(
      '[data-slot="command-dialog-popup"]',
    );
    if (!popupEl) return null;
    const popupRect = popupEl.getBoundingClientRect();
    // find the element that actually scrolls the results
    const candidates = popupEl.querySelectorAll("*");
    let scroller: Element | null = null;
    for (const el of candidates) {
      const style = getComputedStyle(el);
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight &&
        el.querySelector('[data-testid^="resource-picker-state-"]')
      ) {
        scroller = el;
        break;
      }
    }
    const firstRow = popupEl.querySelector(
      '[data-testid^="resource-picker-state-"]',
    );
    const rowVisibleWithinPopup = firstRow
      ? firstRow.getBoundingClientRect().bottom <= popupRect.bottom + 1
      : false;
    return {
      hasScroller: Boolean(scroller),
      scrollerBottom: scroller?.getBoundingClientRect().bottom ?? null,
      popupBottom: popupRect.bottom,
      rowVisibleWithinPopup,
    };
  });
  console.log("containment:", JSON.stringify(containment));
  if (!containment) throw new Error("popup vanished");
  // A scrollable results container must exist and end inside the popup.
  expect(containment.hasScroller).toBe(true);
  if (containment.scrollerBottom !== null) {
    expect(containment.scrollerBottom).toBeLessThanOrEqual(
      containment.popupBottom + 1,
    );
  }
  expect(containment.rowVisibleWithinPopup).toBe(true);
  // The footer with the All/Issues/PRs toggle must also be inside the popup.
  const footer = page.getByTestId("resource-filter-all");
  const footerBox = await footer.boundingBox();
  if (!footerBox) throw new Error("missing footer box");
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(
    popupBox.y + popupBox.height + 1,
  );

  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/kfl333-palette-fixed.png" });
});
