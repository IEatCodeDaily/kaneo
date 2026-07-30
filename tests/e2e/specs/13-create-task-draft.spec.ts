import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Closing the create-task modal used to wipe the form AND delete the
 * server-side draft task that holds uploaded images. Reopening handed the user
 * a blank form with no way back to what they typed.
 */
test.describe("create task draft preservation", () => {
  const boardUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}`;

  async function openCreateModal(page: import("@playwright/test").Page) {
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) return dialog.first();
    await page.getByTitle("Add task").first().click();
    await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
    return dialog.first();
  }

  test("a closed draft is restored on reopen instead of being discarded", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.boardId, "no board available");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(page, boardUrl());
    // Never inherit a draft from an earlier run.
    await page.evaluate(() => window.localStorage.removeItem("task-drafts"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const dialog = await openCreateModal(page);
    const titleInput = dialog.getByPlaceholder("Task title");
    const unique = `Draft survives close ${Date.now()}`;
    await titleInput.fill(unique);

    // Close without submitting.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Reopening must restore what was typed.
    const reopened = await openCreateModal(page);
    await expect(
      reopened.getByPlaceholder("Task title"),
      "Draft title must survive closing the modal.",
    ).toHaveValue(unique);

    // An explicit discard must clear it for good.
    await reopened.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const afterDiscard = await openCreateModal(page);
    await expect(
      afterDiscard.getByPlaceholder("Task title"),
      "Discarding must not leave the draft behind.",
    ).toHaveValue("");
    await afterDiscard.getByRole("button", { name: "Cancel" }).click();

    expect(pageErrors).toEqual([]);
  });

  test("a submitted task does not leave a draft behind", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.boardId, "no board available");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(page, boardUrl());
    await page.evaluate(() => window.localStorage.removeItem("task-drafts"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const dialog = await openCreateModal(page);
    const unique = `Submitted draft cleanup ${Date.now()}`;
    await dialog.getByPlaceholder("Task title").fill(unique);
    await dialog.getByRole("button", { name: "Create Task" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    const reopened = await openCreateModal(page);
    await expect(
      reopened.getByPlaceholder("Task title"),
      "Creating a task must clear the draft.",
    ).toHaveValue("");
    await reopened.getByRole("button", { name: "Cancel" }).click();

    expect(pageErrors).toEqual([]);
  });
});
