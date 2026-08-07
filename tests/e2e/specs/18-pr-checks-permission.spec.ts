import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("missing GitHub Checks permission degrades only the Checks tab", async ({
  page,
  pageErrors,
}) => {
  test.skip(!fixtures.repoId || !fixtures.pullNumber, "PR fixture unavailable");
  await page.route("**/api/repo/*/pull-requests/*/checks", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "GitHub Checks permission missing" }),
    }),
  );
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
  );
  const tabs = page.getByRole("tablist", { name: "Pull request sections" });
  await tabs.getByRole("tab", { name: "Checks" }).click();
  await expect(
    page.getByText("Could not load this section. Reload to try again."),
  ).toBeVisible();

  // A permission failure in one GitHub API must not crash or poison the PR UI.
  await tabs.getByRole("tab", { name: "Discussions" }).click();
  await expect(
    page.getByRole("heading", { name: "Description" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
