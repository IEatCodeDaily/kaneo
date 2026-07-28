import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test.describe("repo issue and pull request details", () => {
  test.skip(!fixtures.repoId, "no repo fixture available");

  const issueUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`;
  const pullUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`;

  test("issue detail renders every panel without runtime errors", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    // Description panel, metadata sidebar, and task links must all mount. The
    // "RepoTaskLinks is not defined" regression died exactly here.
    await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(page.getByLabel("Issue metadata")).toBeVisible();
    await expect(page.getByText("Linked Kaneo tasks")).toBeVisible();
    await expect(page.getByRole("button", { name: /Link task/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("pull request detail renders every panel without runtime errors", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.pullNumber, "no mirrored pull request available");
    await gotoAndSettle(page, pullUrl());

    await expect(page.getByRole("heading", { name: "Description" })).toBeVisible();
    await expect(page.getByLabel("Pull Request metadata")).toBeVisible();
    await expect(page.getByText("Linked Kaneo tasks")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("description editor opens inline with rich editing affordances", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    await page.getByRole("button", { name: /^Edit$/ }).click();

    // Scope to the editable surface: the comment timeline renders its own
    // read-only ProseMirror nodes, so `.ProseMirror` alone is ambiguous.
    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/ })).toBeVisible();
    // No dialog should have opened for description editing.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Cancel restores the read-only view without persisting anything.
    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(editor).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("slash menu opens and is keyboard navigable", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());
    await page.getByRole("button", { name: /^Edit$/ }).click();

    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await editor.click();
    // Start on a fresh line so the slash trigger regex matches.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");

    const menu = page.locator(".kaneo-tiptap-slash-menu");
    await expect(menu).toBeVisible();
    const items = menu.locator(".kaneo-tiptap-slash-item");
    await expect(items.first()).toBeVisible();

    // Arrow keys move the selection; the selected item must change.
    const firstSelected = await menu
      .locator(".kaneo-tiptap-slash-item.is-selected")
      .innerText();
    await page.keyboard.press("ArrowDown");
    const secondSelected = await menu
      .locator(".kaneo-tiptap-slash-item.is-selected")
      .innerText();
    expect(secondSelected).not.toEqual(firstSelected);

    // Escape dismisses without inserting a block.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.getByRole("button", { name: /Cancel/ }).click();
    expect(pageErrors).toEqual([]);
  });

  test("slash command inserts a block via Enter", async ({ page }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());
    await page.getByRole("button", { name: /^Edit$/ }).click();

    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/todo");

    const menu = page.locator(".kaneo-tiptap-slash-menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();

    // A task list node should now exist in the document.
    await expect(editor.locator("ul[data-type='taskList']")).toHaveCount(1);

    // Leave the issue untouched on GitHub.
    await page.getByRole("button", { name: /Cancel/ }).click();
  });

  test("metadata pickers surface pending state", async ({ page, pageErrors }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    const sidebar = page.getByLabel("Issue metadata");
    // Match the section headings exactly: value text like "No assignees" also
    // contains the word "Assignees".
    await expect(sidebar.getByText("Labels", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Assignees", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Milestone", { exact: true })).toBeVisible();
    // Development section lists linked PRs / sub-issues.
    await expect(sidebar.getByText("Development", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
