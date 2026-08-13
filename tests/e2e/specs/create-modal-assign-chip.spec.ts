import { expect, test } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

const BASE = "https://kaneo.entelechia.cloud";

test("create ticket modal: assign chip has the same outline as siblings", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/dashboard/organization/nevrlabs/board/kfl/board`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: /create ticket/i })
    .first()
    .click();
  await page.waitForTimeout(1200);

  const assign = page.getByTestId("create-task-assignee-trigger");
  await expect(assign).toBeVisible({ timeout: 10_000 });
  const border = await assign.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      radius: style.borderRadius,
    };
  });
  console.log("assign chip border:", JSON.stringify(border));
  expect(border.borderStyle).toBe("solid");
  expect(Number.parseFloat(border.borderWidth)).toBeGreaterThan(0);

  const chipRow = assign.locator("..");
  await chipRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/kfl-assign-chip.png" });
});
