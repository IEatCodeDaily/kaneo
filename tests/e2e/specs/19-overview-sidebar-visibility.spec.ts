import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("board and repo overview rows expose sidebar show/hide controls", async ({
  page,
  pageErrors,
}) => {
  await page.route("**/api/board?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "visibility-proof-board",
          name: "Visibility Proof Board",
          icon: "Layout",
          organizationId: fixtures.organizationId,
          statistics: {
            totalTasks: 0,
            completionPercentage: 0,
            dueDate: null,
          },
        },
      ]),
    }),
  );
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}`,
  );
  const boardControl = page
    .getByRole("button", {
      name: /(?:Show|Hide) .* in sidebar/,
    })
    .first();
  await expect(boardControl).toBeVisible();
  const before = await boardControl.getAttribute("aria-label");
  await boardControl.click();
  await expect(boardControl).not.toHaveAttribute("aria-label", before ?? "");
  await boardControl.click();

  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo`,
  );
  const repoControl = page
    .getByRole("button", {
      name: /(?:Show|Hide) .* in sidebar/,
    })
    .first();
  await expect(repoControl).toBeVisible();
  const repoBefore = await repoControl.getAttribute("aria-label");
  await repoControl.click();
  await expect(repoControl).not.toHaveAttribute("aria-label", repoBefore ?? "");
  await repoControl.click();
  expect(pageErrors).toEqual([]);
});
