import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("KFL-160/339: follow chip + three-group assignee picker", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });

  await page.getByText("KFL-190", { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // --- KFL-339: the Follow chip ---
  const follow = page.getByTestId("task-follow-toggle").first();
  await expect(follow).toBeVisible({ timeout: 15_000 });
  const label = await follow.innerText();
  const box = await follow.boundingBox();
  const border = await follow.evaluate(
    (el) =>
      getComputedStyle(el).borderStyle + " " + getComputedStyle(el).borderWidth,
  );
  console.log(
    `follow chip: label=${label.trim()} height=${box?.height} border=${border}`,
  );
  // Must match the sibling outlined property chips (KFL-337 regression guard)
  expect(border).toContain("solid");
  await page.screenshot({ path: "/tmp/kfl339-follow-chip.png" });

  // toggle it and confirm the label flips
  await follow.click();
  await page.waitForTimeout(2500);
  const after = (await follow.innerText()).trim();
  console.log("after click:", after);
  expect(after).not.toBe(label.trim());
  await page.screenshot({ path: "/tmp/kfl339-following.png" });
  // restore
  await follow.click();
  await page.waitForTimeout(2000);

  // --- KFL-160: three-group assignee picker ---
  // The assignee chip shows the CURRENT assignee's name (e.g. "Playwright E2E"),
  // not the word "Assign", so match the avatar-bearing property chip instead.
  const assign = page.getByTestId("task-assignee-trigger").first();
  await assign.click({ timeout: 15_000 });
  await page.waitForTimeout(2000);
  const bodyText = await page.locator("body").innerText();
  for (const heading of ["Users", "Agents", "Teams"]) {
    console.log(`picker shows "${heading}":`, bodyText.includes(heading));
  }
  await page.screenshot({ path: "/tmp/kfl160-picker-groups.png" });
});
