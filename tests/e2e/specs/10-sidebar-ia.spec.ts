import { expect, test } from "@playwright/test";

/** Regression coverage for the Kaneo Feature List sidebar IA batch. */
test.describe("sidebar information architecture", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const raw = localStorage.getItem("user-preferences");
      if (!raw) return;
      const data = JSON.parse(raw) as {
        state?: { hiddenBoardIds?: string[]; hiddenRepoIds?: string[] };
      };
      if (!data.state) return;
      data.state.hiddenBoardIds = [];
      data.state.hiddenRepoIds = [];
      localStorage.setItem("user-preferences", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
  });

  test("Boards and Repos are permanent section links; Overview and Add Board are gone", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-slot="sidebar"]');

    await expect(sidebar.getByText("Overview", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("Add Board", { exact: true })).toHaveCount(
      0,
    );
    await expect(sidebar.getByText("Members", { exact: true })).toBeVisible();

    const boards = sidebar.getByRole("button", { name: /^Boards$/ });
    const repos = sidebar.getByRole("button", { name: /Repos/ });
    await expect(boards).toBeVisible();
    await expect(repos).toBeVisible();

    // A permanent section must not expose collapsible state.
    await expect(boards).not.toHaveAttribute("aria-expanded");
    await expect(repos).not.toHaveAttribute("aria-expanded");

    await repos.click();
    await expect(page).toHaveURL(/\/organization\/[^/]+\/repo$/);
    await boards.click();
    await expect(page).toHaveURL(/\/organization\/[^/]+$/);
  });

  test("section headers expose adjacent create controls", async ({ page }) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    await sidebar.getByRole("button", { name: /^Boards$/ }).hover();
    await expect(
      sidebar.getByRole("button", { name: /add board|create board/i }),
    ).toBeVisible();

    await sidebar.getByRole("button", { name: /Repos/ }).hover();
    await expect(
      sidebar.getByRole("button", {
        name: /add repository|connect repository/i,
      }),
    ).toBeVisible();
  });

  test("Invitations moved from sidebar into the shared profile menu", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar.getByText("Invitations", { exact: true })).toHaveCount(
      0,
    );

    await page
      .getByRole("button", { name: "Open profile menu" })
      .first()
      .click();
    await expect(
      page.getByRole("menuitem", { name: /Invitations/i }),
    ).toBeVisible();
  });

  test("board right-click exposes the same core actions as its overflow menu", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    const boardRow = sidebar.getByRole("button", {
      name: "Kaneo Feature List",
    });
    await boardRow.click({ button: "right" });

    await expect(
      page.getByRole("menuitem", { name: "View board" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Share board" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Board settings" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Hide from sidebar" }),
    ).toBeVisible();
  });

  test("a repository can be hidden and restored without leaving the sidebar", async ({
    page,
  }) => {
    const sidebar = page.locator('[data-slot="sidebar"]');
    const repoRow = sidebar.getByRole("button", {
      name: /^kaneo-test\s+\d+/i,
    });
    await expect(repoRow).toBeVisible();

    await repoRow.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide from sidebar" }).click();
    await expect(repoRow).toHaveCount(0);

    await sidebar
      .getByRole("button", { name: "Repository sidebar options" })
      .click();
    await page.getByRole("menuitem", { name: /Show kaneo-test/i }).click();
    await expect(repoRow).toBeVisible();
  });
});
