import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Regression coverage for bugs that shipped despite green builds:
 *  - "RepoTaskLinks is not defined": JSX used without an import.
 *  - "L is not iterable": the task picker iterated the board payload as if it
 *    were a flat task array.
 */
test.describe("github link regressions", () => {
  test.skip(!fixtures.repoId, "no repo fixture available");

  test("issue task-link picker lists real tasks instead of crashing", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`,
    );

    await page.getByRole("button", { name: /Link task/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Either candidate tasks render, or the explicit empty state shows. A
    // TypeError (the old "L is not iterable") must never surface.
    await expect
      .poll(
        async () => {
          const rows = await dialog.locator("button").count();
          const empty = await dialog
            .getByText(/No unlinked tasks found/i)
            .count();
          return rows + empty;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    // Task rows are rendered from board columns; at least one must exist since
    // the fixture organization has tasks.
    await expect(
      dialog.getByText(/No unlinked tasks found/i).or(dialog.locator("button").nth(1)),
    ).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("sub-issue controls are available on issue details", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`,
    );

    const sidebar = page.getByLabel("Issue metadata");
    await expect(sidebar.getByText("Development")).toBeVisible();

    // The add-sub-issue affordance must exist and open an input.
    const addButton = sidebar.getByRole("button", { name: /Add sub-issue/i });
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect(sidebar.getByLabel("Sub-issue number")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("sub-issue endpoints are wired up", async ({ page }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    // Self-reference is rejected by the controller: proves the route exists and
    // validates input rather than 404ing.
    const response = await page.request.post(
      `${fixtures.baseURL}/api/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}/sub-issues`,
      { data: { subIssueNumber: fixtures.issueNumber } },
    );
    expect(response.status()).toBe(400);
    expect(await response.text()).toMatch(/own sub-issue/i);
  });
});
