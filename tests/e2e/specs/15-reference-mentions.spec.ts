import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * `#` mentions tasks, issues and pull requests. `@` was already taken by member
 * mentions, so `#` follows the convention users know from GitHub.
 *
 * Selecting a result inserts a kaneoIssueLink node — the node the editor already
 * renders with a hover preview — rather than plain text.
 */
test.describe("task and issue/PR mentions", () => {
  let taskId = "";

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: "tests/e2e/.auth/user.json",
      baseURL: fixtures.baseURL,
    });
    const created = await ctx.post(`/api/task/${fixtures.boardId}`, {
      data: {
        title: `Reference mention spec ${Date.now()}`,
        description: "",
        status: "to-do",
        priority: "low",
        userId: "",
      },
    });
    if (created.status() === 200) taskId = (await created.json()).id;
    await ctx.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    if (!taskId) return;
    const ctx = await playwright.request.newContext({
      storageState: "tests/e2e/.auth/user.json",
      baseURL: fixtures.baseURL,
    });
    await ctx.delete(`/api/task/${taskId}`);
    await ctx.dispose();
  });

  test("typing # in a comment suggests references and inserts a rich link", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.boardId, "no board available");
    expect(taskId, "fixture task must exist").toBeTruthy();

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    // The comment composer is the editor every user reaches first.
    const composer = page.locator(".ProseMirror").last();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.click();
    await composer.pressSequentially("#sync", { delay: 60 });

    const suggestions = page.getByTestId("reference-suggestions");
    await expect(
      suggestions,
      "typing # must offer task/issue/PR suggestions",
    ).toBeVisible({ timeout: 15_000 });

    const first = suggestions.locator("button").first();
    const label = (await first.innerText()).trim();
    expect(label.length, "a suggestion must render a label").toBeGreaterThan(0);

    await first.click();
    await expect(suggestions).toBeHidden();

    // The selection must become a rich reference node, not literal "#sync".
    await expect(
      composer.locator(".kaneo-issue-link-node"),
      "selecting a suggestion must insert a reference node",
    ).toHaveCount(1);
    await expect(composer).not.toContainText("#sync");

    expect(pageErrors).toEqual([]);
  });

  test("# suggestions can be dismissed with Escape", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.boardId, "no board available");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    const composer = page.locator(".ProseMirror").last();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.click();
    await composer.pressSequentially("#sync", { delay: 60 });

    const suggestions = page.getByTestId("reference-suggestions");
    await expect(suggestions).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(suggestions).toBeHidden();

    expect(pageErrors).toEqual([]);
  });
});
