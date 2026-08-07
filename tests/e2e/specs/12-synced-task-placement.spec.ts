import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * "Add Synced Task" creates a task that follows this issue, so it belongs to the
 * Synced Tasks section. Sitting in the Linked Tasks header put a sync action
 * beside an unrelated ordinary-link action, which is exactly the redundancy the
 * board item calls out.
 */
test.describe("synced task action placement", () => {
  test("issue detail keeps the synced-task action inside Synced Tasks", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`,
    );

    const linkedSection = page.getByTestId("repo-linked-tasks");
    const syncedSection = page.getByTestId("repo-synced-tasks");
    await expect(syncedSection).toBeVisible();

    const syncedAction = syncedSection.getByRole("button", {
      name: "Add Synced Task",
    });
    await expect(
      syncedAction,
      "Add Synced Task must live in the Synced Tasks section it affects.",
    ).toBeVisible();
    await expect(
      linkedSection.getByRole("button", { name: "Add Synced Task" }),
      "Linked Tasks must not host the synced-task action.",
    ).toHaveCount(0);
    await expect(
      linkedSection.getByRole("button", { name: "Link task" }),
    ).toBeVisible();

    await syncedAction.click();
    await expect(
      page.getByRole("dialog", { name: "Add Synced Task" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    expect(pageErrors).toEqual([]);
  });

  test("pull request detail offers no synced-task section", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.pullNumber, "no mirrored pull request available");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
    );

    await expect(page.getByTestId("repo-linked-tasks")).toBeVisible();
    await expect(page.getByTestId("repo-synced-tasks")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Synced Task" }),
    ).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });
});
