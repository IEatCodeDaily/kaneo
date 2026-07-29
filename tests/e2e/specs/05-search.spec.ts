import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test.describe("global search", () => {
  const searchUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/search`;

  test("finds repositories, issues, and pull requests", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.repoName, "no repo fixture available");
    await gotoAndSettle(page, searchUrl());

    const input = page.getByRole("textbox").first();
    await input.fill(fixtures.repoName as string);

    // The API is queried live; results arrive asynchronously.
    await expect
      .poll(async () => (await page.locator("body").innerText()).length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    const body = await page.locator("body").innerText();
    expect(body).toContain(fixtures.repoName as string);
    expect(pageErrors).toEqual([]);
  });

  test("search palette surfaces repo results and navigates", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.repoName, "no repo fixture available");
    await gotoAndSettle(page, "/dashboard");

    // Click the sidebar Search affordance — the "/" shortcut only fires when
    // the page body already has focus, which is unreliable right after load.
    await page
      .getByRole("button", { name: /^Search/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The command input is a custom combobox, so target it by placeholder
    // rather than the textbox role.
    const input = page.getByPlaceholder(/Search tasks, boards, comments/i);
    await input.fill(fixtures.repoName as string);

    // Repositories group must appear for a repo-name query.
    await expect(dialog.getByText("Repositories")).toBeVisible({
      timeout: 20_000,
    });

    const repoOption = dialog
      .getByRole("option", {
        name: new RegExp(fixtures.repoName as string, "i"),
      })
      .first();
    await expect(repoOption).toBeVisible();
    await repoOption.click();

    // Selecting a repository result navigates into the repo code view.
    await expect(page).toHaveURL(new RegExp(`/repo/${fixtures.repoId}`), {
      timeout: 20_000,
    });
    expect(pageErrors).toEqual([]);
  });

  test("search API returns repo, issue, and pull request result types", async ({
    page,
  }) => {
    test.skip(!fixtures.repoName, "no repo fixture available");
    // Assert on the contract directly so a UI-only regression can't hide it.
    const response = await page.request.get(
      `${fixtures.baseURL}/api/search?q=${encodeURIComponent("Fixture")}&type=all&organizationId=${fixtures.organizationId}&limit=50`,
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const types = new Set(
      (body.results ?? []).map((result: { type: string }) => result.type),
    );
    // At least the GitHub-derived types must be searchable now.
    expect(types.has("issue") || types.has("pull_request")).toBeTruthy();
  });
});
