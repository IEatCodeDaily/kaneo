import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * List rows are deliberately shared: title + labels on line one, then state and
 * number on line two. Measurements catch a CSS-only regression that text
 * assertions cannot — a wrapping title silently destroys list alignment.
 */
test.describe("repository issue and pull request list parity", () => {
  test.skip(
    !fixtures.organizationId || !fixtures.repoId,
    "repo fixtures missing",
  );

  test("uses the same fixed two-line layout in issues and pulls", async ({
    page,
    pageErrors,
  }) => {
    for (const kind of ["issues", "pulls"] as const) {
      await gotoAndSettle(
        page,
        `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/${kind}`,
      );

      // Seeded fixture items are open. Assert the seed first: an empty list is
      // a fixture failure, never a reason to skip layout coverage.

      const rows = page.locator("[data-slot='repo-list-row']");
      await expect(rows.first()).toBeVisible();

      const layout = await rows.evaluateAll((elements) =>
        elements.map((element) => {
          const row = element.getBoundingClientRect();
          const title = element.querySelector(
            "[data-slot='repo-list-row-title']",
          );
          const state = element.querySelector("[data-slot='repo-state-badge']");
          const number = element.querySelector(
            "[data-slot='repo-list-row-number']",
          );
          const labels = element.querySelector("[data-slot='repo-label-list']");
          const midY = (node: Element) => {
            const rect = node.getBoundingClientRect();
            return rect.top + rect.height / 2;
          };
          return {
            height: Math.round(row.height),
            scrolls: element.scrollHeight > element.clientHeight + 1,
            labelsShareTitleLine:
              labels && title
                ? Math.abs(midY(labels) - midY(title)) < 10
                : null,
            stateBelowTitle:
              state && title ? midY(state) - midY(title) > 8 : false,
            stateBeforeNumber:
              state && number
                ? state.getBoundingClientRect().left <
                  number.getBoundingClientRect().left
                : false,
          };
        }),
      );

      expect(new Set(layout.map((row) => row.height))).toEqual(new Set([64]));
      expect(layout.every((row) => !row.scrolls)).toBe(true);
      expect(layout.every((row) => row.stateBelowTitle)).toBe(true);
      expect(layout.every((row) => row.stateBeforeNumber)).toBe(true);

      // The issue-list regression was a dead RepoLabelList import. Only assert
      // label position on rows that actually have labels in fixture data.
      const labelledRows = layout.filter(
        (row) => row.labelsShareTitleLine !== null,
      );
      if (labelledRows.length > 0) {
        expect(labelledRows.every((row) => row.labelsShareTitleLine)).toBe(
          true,
        );
      }
    }

    expect(pageErrors).toEqual([]);
  });

  test("pull detail hides its back button on desktop and has no issue relations", async ({
    page,
    pageErrors,
    request,
  }) => {
    const response = await request.get(
      `/api/repo/${fixtures.repoId}/pull-requests`,
    );
    expect(response.ok()).toBe(true);
    const body = await response.json();
    const pull = body.data?.[0];
    test.skip(!pull, "fixture repo has no pull requests");

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${pull.number}`,
    );

    await expect(
      page.getByRole("button", { name: "Back to pull requests" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Rename pull request" }),
    ).toBeVisible();
    await expect(page.getByText("Add sub-issue")).toHaveCount(0);
    await expect(page.getByTestId("repo-issue-relations")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add Synced Task" }),
    ).toHaveCount(0);
    await expect(page.getByText("Synced Tasks", { exact: true })).toHaveCount(
      0,
    );
    expect(pageErrors).toEqual([]);
  });

  test("pull detail uses viewport tabs and a single-file diff workspace", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.pullNumber, "no mirrored pull request available");

    await page.route("**/api/repo/*/pull-requests/*/files", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          files: [
            {
              filename: "src/first.ts",
              status: "modified",
              additions: 1,
              deletions: 1,
              changes: 2,
              patch:
                "@@ -1 +1 @@\n-export const value = 'old';\n+export const value = 'first';",
              previousFilename: null,
              blobUrl: "https://example.test/blob/first",
              rawUrl: "https://example.test/raw/first",
            },
            {
              filename: "src/second.ts",
              status: "added",
              additions: 1,
              deletions: 0,
              changes: 1,
              patch: "@@ -0,0 +1 @@\n+export const selected = 'second';",
              previousFilename: null,
              blobUrl: "https://example.test/blob/second",
              rawUrl: "https://example.test/raw/second",
            },
          ],
          totals: { additions: 2, deletions: 1, changedFiles: 2 },
        }),
      }),
    );
    await page.route("**/api/repo/*/pull-requests/*/commits", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          commits: [
            {
              sha: "1234567890abcdef",
              message: "Deterministic tab commit",
              authorLogin: "octocat",
              authorName: "Octo Cat",
              committedAt: "2026-07-29T00:00:00Z",
              url: "https://example.test/commit",
            },
          ],
        }),
      }),
    );
    await page.route("**/api/repo/*/pull-requests/*/checks", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          conclusion: "success",
          checks: [
            {
              name: "deterministic-ci",
              status: "completed",
              conclusion: "success",
              url: "https://example.test/check",
            },
          ],
          runs: [],
        }),
      }),
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
    );

    const tabs = page.getByRole("tablist", { name: "Pull request sections" });
    for (const name of ["Discussions", "Commits", "Checks", "Diffs"]) {
      await expect(
        tabs.getByRole("tab", { name, exact: true }),
        `Expected a visible ${name} viewport tab, not stacked collapsible sections.`,
      ).toBeVisible();
    }

    await tabs.getByRole("tab", { name: "Commits" }).click();
    await expect(page.getByText("Deterministic tab commit")).toBeVisible();
    await expect(
      page.getByText("deterministic-ci", { exact: true }),
    ).toBeHidden();

    await tabs.getByRole("tab", { name: "Checks" }).click();
    await expect(
      page.getByText("deterministic-ci", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Deterministic tab commit")).toBeHidden();

    await tabs.getByRole("tab", { name: "Discussions" }).click();
    await expect(
      page.getByRole("heading", { name: "Description" }),
    ).toBeVisible();
    await expect(
      page.getByText("deterministic-ci", { exact: true }),
    ).toBeHidden();

    await tabs.getByRole("tab", { name: "Diffs" }).click();
    const workspace = page.getByTestId("pull-request-diff-workspace");
    const fileHeaders = workspace.getByTestId("pull-request-selected-file");
    await expect(fileHeaders).toHaveCount(2);
    await expect(fileHeaders.nth(0)).toHaveText("src/first.ts");
    await expect(fileHeaders.nth(1)).toHaveText("src/second.ts");
    await expect(workspace.locator("diffs-container")).toHaveCount(2);

    const secondFileButton = workspace.getByRole("button", {
      name: "src/second.ts",
      exact: true,
    });
    await secondFileButton.click();
    await expect(secondFileButton).toHaveClass(/bg-muted/);

    const unified = workspace.getByRole("button", { name: "Unified" });
    const split = workspace.getByRole("button", { name: "Side-by-side" });
    await expect(unified).toHaveAttribute("aria-pressed", "true");
    await split.click();
    await expect(split).toHaveAttribute("aria-pressed", "true");
    await expect(unified).toHaveAttribute("aria-pressed", "false");
    const diffRenderers = workspace.getByTestId("pull-request-diff-renderer");
    await expect(diffRenderers).toHaveCount(2);
    await expect(diffRenderers.nth(0)).toHaveAttribute(
      "data-diff-style",
      "split",
    );
    await expect(diffRenderers.nth(1)).toHaveAttribute(
      "data-diff-style",
      "split",
    );

    await workspace
      .getByRole("button", { name: "Open diff fullscreen" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Pull request diff" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("pull-request-selected-file")).toHaveCount(
      2,
    );
    await expect(dialog.locator("diffs-container")).toHaveCount(2);
    await expect(
      dialog.getByRole("navigation", { name: "Changed files fullscreen" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(secondFileButton).toHaveClass(/bg-muted/);
    await expect(workspace.locator("diffs-container")).toHaveCount(2);
    expect(pageErrors).toEqual([]);
  });

  test("synced task shows broken state, retry, and confirmation-gated unsync", async ({
    page,
  }) => {
    await page.route("**/api/repo/*/issues/*", async (route) => {
      if (
        !route
          .request()
          .url()
          .match(/\/issues\/\d+$/)
      )
        return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: {
          ...body,
          taskLinks: [
            {
              id: "sync-link-fixture",
              taskId: "sync-task-fixture",
              createdAt: "2026-07-29T00:00:00Z",
              syncEnabled: true,
              syncBrokenAt: "2026-07-29T00:00:00Z",
              syncBrokenReason: "GitHub App access lost",
              task: {
                id: "sync-task-fixture",
                title: "Broken follower",
                status: "todo",
                priority: null,
                number: 303,
                boardId: fixtures.boardId,
              },
            },
          ],
        },
      });
    });
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`,
    );
    await expect(page.getByText("Broken", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry sync for Broken follower" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Unsync Broken follower" }).click();
    await expect(
      page.getByRole("heading", { name: "Unsync task?" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "The task stops following GitHub updates. The task and ordinary link remain.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unsync task" }),
    ).toBeVisible();
  });
});
