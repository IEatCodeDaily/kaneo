import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Full task <-> GitHub linking round trip through the UI, plus verification
 * against the API so we prove persistence rather than optimistic rendering.
 */
test.describe("task resources and github linking", () => {
  test.skip(
    !fixtures.boardId || !fixtures.repoId,
    "board/repo fixtures missing",
  );

  let taskId: string | undefined;
  let taskUrl: string;

  test.beforeAll(async ({ browser }) => {
    // Reuse the signed-in storage state: a bare context is unauthenticated, so
    // POST /api/task returned 401 and every test below silently skipped.
    const context = await browser.newContext({
      baseURL: fixtures.baseURL,
      storageState: "tests/e2e/.auth/user.json",
    });
    const columns = await context.request.get(
      `${fixtures.baseURL}/api/column/${fixtures.boardId}`,
    );
    const columnBody = columns.ok() ? await columns.json() : [];
    // `status` is the column SLUG, not its id.
    const columnSlug = Array.isArray(columnBody)
      ? columnBody[0]?.slug
      : columnBody?.[0]?.slug;

    // Task creation is POST /task/{boardId} (not /task), and `description` is
    // required — the old call 404'd, silently skipping every test here.
    const created = await context.request.post(
      `${fixtures.baseURL}/api/task/${fixtures.boardId}`,
      {
        data: {
          title: `E2E resource link ${Date.now()}`,
          description: "Seeded by the Playwright resources suite.",
          status: columnSlug ?? "to-do",
          priority: "medium",
        },
      },
    );
    if (created.ok()) {
      const body = await created.json();
      taskId = body?.id ?? body?.task?.id;
    } else {
      console.error(
        "[04-task-resources] task seed failed",
        created.status(),
        await created.text(),
      );
    }
    await context.close();
  });

  test.beforeEach(() => {
    test.skip(!taskId, "could not seed a task via the API");
    taskUrl = `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`;
  });

  test("task detail shows a Resources section next to subtasks", async ({
    page,
    pageErrors,
  }) => {
    await gotoAndSettle(page, taskUrl);
    await expect(page.getByText("Resources", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Link issue or pull request/i }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("links a GitHub issue and persists it", async ({ page, pageErrors }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, taskUrl);

    await page
      .getByRole("button", { name: /Link issue or pull request/i })
      .click();

    // The picker is now a command palette (matching Relations): type to filter
    // across repos, then pick the issue. No repository <select> or tabs.
    // NOTE: the task detail sheet is ALSO role=dialog, so scope by the search
    // box rather than a bare getByRole("dialog").
    const search = page.getByPlaceholder(/Search issues and pull requests/i);
    await expect(search).toBeVisible();
    const dialog = page.getByRole("dialog").filter({ has: search });
    await search.fill(String(fixtures.issueNumber));

    const issueRow = dialog
      .getByRole("option", { name: new RegExp(`#${fixtures.issueNumber}\\b`) })
      .first();
    await expect(issueRow).toBeVisible({ timeout: 20_000 });
    await issueRow.click();

    // Palette closes and the link appears in the Resources list.
    await expect(search).toBeHidden({ timeout: 20_000 });
    const linkedItem = page
      .getByRole("link", { name: new RegExp(`#${fixtures.issueNumber}\\b`) })
      .first();
    await expect(linkedItem).toBeVisible({ timeout: 20_000 });

    // Prove persistence: the API must report the link, not just the UI.
    const response = await page.request.get(
      `${fixtures.baseURL}/api/task/${taskId}/repo-links`,
    );
    expect(response.ok()).toBeTruthy();
    const links = await response.json();
    expect(
      links.some(
        (link: { number: number; itemType: string }) =>
          link.number === fixtures.issueNumber && link.itemType === "issues",
      ),
    ).toBeTruthy();

    expect(pageErrors).toEqual([]);
  });

  test("linked item survives a reload and can be unlinked", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, taskUrl);

    const linked = page
      .getByRole("link", { name: new RegExp(`#${fixtures.issueNumber}\\b`) })
      .first();
    await expect(linked).toBeVisible({ timeout: 20_000 });

    // Remove the link through the UI.
    await linked.hover();
    await page
      .getByRole("button", {
        name: new RegExp(`Unlink #${fixtures.issueNumber}`),
      })
      .click();
    await expect(linked).toBeHidden({ timeout: 20_000 });

    // API confirms removal.
    const response = await page.request.get(
      `${fixtures.baseURL}/api/task/${taskId}/repo-links`,
    );
    const links = await response.json();
    expect(
      links.some(
        (link: { number: number }) => link.number === fixtures.issueNumber,
      ),
    ).toBeFalsy();

    expect(pageErrors).toEqual([]);
  });

  test.afterAll(async ({ browser }) => {
    if (!taskId) return;
    // Reuse the signed-in storage state: a bare context is unauthenticated, so
    // POST /api/task returned 401 and every test below silently skipped.
    const context = await browser.newContext({
      baseURL: fixtures.baseURL,
      storageState: "tests/e2e/.auth/user.json",
    });
    await context.request.delete(`${fixtures.baseURL}/api/task/${taskId}`);
    await context.close();
  });
});
