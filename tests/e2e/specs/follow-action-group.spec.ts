import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("follow button sits in the action group with filled/slashed states", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page.getByText("KFL-190", { exact: true }).first().click();
  await page.waitForTimeout(2500);

  const follow = page.getByTestId("task-follow-toggle").first();
  await expect(follow).toBeVisible({ timeout: 15_000 });

  // PLACEMENT: it must sit in the action-button group, i.e. horizontally
  // adjacent to the copy-branch button, not back in the property-chip row.
  const branch = page.getByTestId("copy-task-branch").first();
  const [fb, bb] = [await follow.boundingBox(), await branch.boundingBox()];
  console.log("branch box:", JSON.stringify(bb));
  console.log("follow box:", JSON.stringify(fb));
  expect(fb && bb).toBeTruthy();
  if (fb && bb) {
    // same row (within a few px) and immediately to the right
    expect(Math.abs(fb.y - bb.y)).toBeLessThan(6);
    expect(fb.x).toBeGreaterThan(bb.x);
  }

  // ICON-ONLY: no text label in the action group.
  expect((await follow.innerText()).trim()).toBe("");

  // STATE: not following -> slashed hollow bell.
  const state0 = await follow.locator("svg").getAttribute("data-follow-state");
  const fill0 = await follow.locator("svg").getAttribute("fill");
  console.log(`initial: state=${state0} fill=${fill0}`);

  await follow.click();
  await page.waitForTimeout(2500);

  const state1 = await follow.locator("svg").getAttribute("data-follow-state");
  const fill1 = await follow.locator("svg").getAttribute("fill");
  console.log(`after click: state=${state1} fill=${fill1}`);
  expect(state1).not.toBe(state0);
  await page.screenshot({ path: "/tmp/kfl339-follow-in-actions.png" });

  // restore
  await follow.click();
  await page.waitForTimeout(2000);
});

test("assignee picker is keyboard navigable and taller", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page.getByText("KFL-190", { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.getByTestId("task-assignee-trigger").first().click();
  await page.waitForTimeout(1500);

  // The list container should now be taller than the old ~224px cap.
  const list = page.locator(".max-h-96").first();
  const cls = await list.getAttribute("class");
  console.log("list classes:", cls);
  expect(cls).toContain("max-h-96");

  // ARROW KEYS: the popover already focuses the search box on open, which is
  // how a real user meets it. Do NOT click it first — a click re-renders the
  // list and resets the highlight, which is correct behaviour but would make
  // this probe measure the wrong thing.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  const active1 = await page.locator('[data-active="true"]').count();
  console.log("active rows after 1x ArrowDown:", active1);
  expect(active1).toBe(1);
  const firstName = await page.locator('[data-active="true"]').innerText();

  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  const secondName = await page.locator('[data-active="true"]').innerText();
  console.log(`ArrowDown moved: ${firstName.trim()} -> ${secondName.trim()}`);
  expect(secondName).not.toBe(firstName);

  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  const backName = await page.locator('[data-active="true"]').innerText();
  console.log("ArrowUp returned to:", backName.trim());
  expect(backName).toBe(firstName);

  await page.screenshot({ path: "/tmp/kfl160-picker-keyboard.png" });
});
