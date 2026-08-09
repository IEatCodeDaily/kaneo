import { expect, test } from "@playwright/test";

const boardUrl =
  "/dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/board/bz268m76v2r4eiqialpo1apo/board";

test("sidebar is stacked and translated; create ticket stays in board toolbar", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(boardUrl, { waitUntil: "networkidle" });

  await expect(page.getByText("Inbox", { exact: true })).toBeVisible();
  await expect(page.getByText("My Tickets", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Boards", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Repos", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/^sidebar\./)).toHaveCount(0);

  const toolbar = page.getByTestId("board-toolbar");
  await expect(
    toolbar.getByRole("button", { name: /create ticket/i }),
  ).toBeVisible();
  await expect(errors).toEqual([]);
  await page.screenshot({
    path: "/tmp/kaneo-sidebar-restored.png",
    fullPage: true,
  });
});
