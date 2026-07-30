import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * "Create Synced Issue in Repo" is the inverse of linking an existing issue:
 * Kaneo owns the content first, then GitHub becomes authoritative. The action
 * belongs beside the link action in Resources, and must disappear once the task
 * already follows an issue (the API permits only one synced issue per task).
 *
 * This spec drives the UI only — it stubs the POST so the suite never opens real
 * GitHub issues. The endpoint itself is covered against a live test repo
 * separately.
 */
test.describe("create synced issue from a task", () => {
  let taskId = "";

  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      storageState: "tests/e2e/.auth/user.json",
      baseURL: fixtures.baseURL,
    });
    const created = await ctx.post(`/api/task/${fixtures.boardId}`, {
      data: {
        title: `Create synced issue UI ${Date.now()}`,
        description: "Fixture for the create-synced-issue UI spec.",
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

  test("the action sits beside Link issue and opens a repo picker", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.boardId, "no board available");
    expect(taskId, "fixture task must exist").toBeTruthy();

    let posted: { url: string; body: unknown } | null = null;
    await page.route("**/api/repo/*/synced-issues", async (route) => {
      posted = {
        url: route.request().url(),
        body: route.request().postDataJSON(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          taskId: "stub",
          repoId: "stub",
          issueId: "stub",
          number: 4242,
          htmlUrl: "https://github.com/example/repo/issues/4242",
        }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    const createAction = page.getByRole("button", {
      name: "Create synced issue in repo",
    });
    await expect(
      createAction,
      "Creating a synced issue must be offered beside the link action.",
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: "Link issue or pull request" }),
    ).toBeVisible();

    await createAction.click();
    const dialog = page.getByRole("dialog", {
      name: "Create synced issue in repo",
    });
    await expect(dialog).toBeVisible();

    const picker = dialog.getByLabel("Repository for the new issue");
    await expect(picker).toBeVisible();
    // Creating must stay disabled until a repository is chosen.
    await expect(
      dialog.getByRole("button", { name: "Create issue" }),
    ).toBeDisabled();

    await picker.click();
    // The combobox popup is portalled, so it lives outside the dialog subtree.
    const repository = page.getByRole("option").first();
    await expect(
      repository,
      "at least one repository must be selectable",
    ).toBeVisible();
    const repositoryLabel = ((await repository.textContent()) ?? "").trim();
    expect(repositoryLabel, "the option must name its repository").toBeTruthy();
    await repository.click();

    await dialog.getByRole("button", { name: "Create issue" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    expect(posted, "the create request must reach the API").not.toBeNull();
    // The picker now shows owner/name, so resolve the chosen repository's id
    // from the fixtures rather than reading a removed <option value>.
    expect((posted as unknown as { url: string }).url).toMatch(
      /\/repo\/[^/]+\/synced-issues$/,
    );
    expect(
      (posted as unknown as { body: { taskId?: string } }).body.taskId,
      "the request must carry the task id",
    ).toBeTruthy();

    expect(pageErrors).toEqual([]);
  });
});
