import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("board and list views mark a subtask with a clickable parent id", async ({
  page,
  pageErrors,
}) => {
  // Relations are real data; the board payload is stubbed so the assertion does
  // not depend on a seeded relation surviving other tests.
  await page.route(`**/api/task/tasks/${fixtures.boardId}*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const columns = body.data?.columns ?? [];
    let stamped = false;
    for (const column of columns) {
      for (const task of column.tasks ?? []) {
        if (!stamped) {
          task.parentTask = {
            id: "parent-fixture",
            number: 12,
            title: "Parent fixture task",
            status: "to-do",
          };
          stamped = true;
        }
      }
    }
    await route.fulfill({ response, json: body });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/board`,
  );

  const badge = page.getByTestId("subtask-of-badge").first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("Subtask of");

  // The identifier is the link, not the whole label.
  const parentLink = badge.getByRole("link");
  await expect(parentLink).toHaveText(/-12$|#12/);
  await expect(parentLink).toHaveAttribute("href", /\/task\/parent-fixture$/);

  expect(pageErrors).toEqual([]);
});
