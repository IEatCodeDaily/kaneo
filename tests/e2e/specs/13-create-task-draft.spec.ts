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
    const visibleDialog = page.locator('[role="dialog"]:visible');
    if (await visibleDialog.count()) return visibleDialog.first();
    await page
      .getByRole("button", { name: "Create ticket", exact: true })
      .first()
      .click();
    await expect(visibleDialog.first()).toBeVisible({ timeout: 10_000 });
    return visibleDialog.first();
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
    const titleInput = dialog.getByPlaceholder("Ticket title");
    const unique = `Draft survives close ${Date.now()}`;
    const description = `Description survives close ${Date.now()}`;
    await titleInput.fill(unique);
    await dialog.locator(".ProseMirror").fill(description);

    // Close without submitting.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const drafts = JSON.parse(
            window.localStorage.getItem("task-drafts") ?? "{}",
          );
          return Object.values(drafts.state?.drafts ?? {}).map(
            (draft: { description?: string }) => draft.description,
          );
        }),
      )
      .toContain(description);

    // Reopening must restore what was typed.
    const reopened = await openCreateModal(page);
    await expect(
      reopened.getByPlaceholder("Ticket title"),
      "Draft title must survive closing the modal.",
    ).toHaveValue(unique);
    await expect(
      reopened.locator(".ProseMirror"),
      "Draft description must survive closing the modal.",
    ).toContainText(description);

    // An explicit discard must clear it for good.
    await reopened.getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const afterDiscard = await openCreateModal(page);
    await expect(
      afterDiscard.getByPlaceholder("Ticket title"),
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
    await dialog.getByPlaceholder("Ticket title").fill(unique);
    await dialog.getByRole("button", { name: "Create Ticket" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    const reopened = await openCreateModal(page);
    await expect(
      reopened.getByPlaceholder("Ticket title"),
      "Creating a task must clear the draft.",
    ).toHaveValue("");
    await reopened.getByRole("button", { name: "Cancel" }).click();

    expect(pageErrors).toEqual([]);
  });
});
