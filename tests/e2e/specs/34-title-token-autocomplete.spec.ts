import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * #72: typing `#` / `@` / `>` in the Create Task title opens an inline picker.
 * Enter commits the value into the task's fields and removes the token from the
 * title; Space leaves the sigil as ordinary title text.
 */
const fixtures = JSON.parse(
  readFileSync("tests/e2e/.auth/fixtures.json", "utf8"),
) as { baseURL: string; organizationId: string; boardId: string | null };

test.describe("#72 create-task title token autocomplete", () => {
  test.beforeEach(async ({ page }) => {
    const { organizationId, boardId } = fixtures;
    // The boards *index* has no create-task control — go inside a board.
    await page.goto(
      `/dashboard/organization/${organizationId}/board/${boardId}/board`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(4000);
  });

  async function openCreateTask(page: import("@playwright/test").Page) {
    // shortcuts.task is a prefix sequence: `t` then `c`.
    await page.keyboard.press("t");
    await page.keyboard.press("c");
    const title = page.getByPlaceholder(/task title|title/i).first();
    await expect(title).toBeVisible({ timeout: 15_000 });
    return title;
  }

  test("# opens the label picker and Enter applies the label, not the title", async ({
    page,
  }) => {
    const title = await openCreateTask(page);

    await title.fill("Title token probe ");
    await title.press("#");
    const picker = page.getByTestId("title-token-suggestions");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute("data-token-kind", "label");

    const firstOption = page.getByTestId("title-token-option").first();
    const labelName = (await firstOption.innerText()).trim();
    await title.press("Enter");

    // The token is gone from the title (the separating space it followed
    // legitimately remains — only the `#query` is consumed)...
    await expect(picker).toBeHidden();
    await expect(title).toHaveValue("Title token probe ");
    await expect(title).not.toHaveValue(/#/);

    // ...and the label is now attached to the task being created. Scope the
    // check outside the (now closed) suggestion list so it cannot pass by
    // matching the dropdown row that was just clicked.
    await expect(page.getByTestId("title-token-option")).toHaveCount(0);
    await expect(
      page.getByText(labelName, { exact: true }).first(),
    ).toBeVisible();
  });

  test("Space keeps the sigil as plain title text", async ({ page }) => {
    const title = await openCreateTask(page);

    // A "#" glued to a word (like "C#") must not open the picker at all.
    await title.fill("Sharp C#");
    await expect(page.getByTestId("title-token-suggestions")).toBeHidden();

    await title.fill("Release ");
    await title.press("#");
    await expect(page.getByTestId("title-token-suggestions")).toBeVisible();
    await title.press("Space");
    await expect(page.getByTestId("title-token-suggestions")).toBeHidden();
    await expect(title).toHaveValue("Release # ");
  });

  test("> opens the priority picker", async ({ page }) => {
    const title = await openCreateTask(page);
    await title.fill("Priority probe ");
    await title.press(">");
    const picker = page.getByTestId("title-token-suggestions");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute("data-token-kind", "priority");
  });
});
