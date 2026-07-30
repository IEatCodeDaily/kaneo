import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("board and list group same-column subtasks and collapse them", async ({
  page,
  pageErrors,
}) => {
  let childTitle = "";
  await page.route(`**/api/task/tasks/${fixtures.boardId}*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const columns = body.data?.columns ?? [];
    const column = columns.find(
      (candidate: { tasks?: unknown[] }) => (candidate.tasks?.length ?? 0) >= 2,
    );
    if (!column) throw new Error("Fixture board needs two tasks in one column");
    const [parent, child] = column.tasks;
    childTitle = child.title;
    child.parentTask = {
      id: parent.id,
      number: parent.number,
      title: parent.title,
      status: parent.status,
    };
    await route.fulfill({ response, json: body });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/board`,
  );

  const boardGroup = page.getByTestId("task-group").first();
  await expect(boardGroup).toBeVisible();
  // A parent may itself be a subtask, so a group can legitimately contain
  // two relationship badges. The nested child's badge is the last one.
  const badge = boardGroup.getByTestId("subtask-of-badge").last();
  await expect(badge).toContainText("Subtask of");
  await expect(badge.getByRole("link")).toHaveAttribute("href", /\/task\//);

  const boardToggle = boardGroup.getByRole("button", {
    name: /collapse 1 subtask/i,
  });
  await boardToggle.click();
  await expect(boardGroup.getByText(childTitle, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    boardGroup.getByRole("button", { name: /expand 1 subtask/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "List", exact: true }).click();
  const listGroup = page.getByTestId("list-task-group").first();
  await expect(listGroup).toBeVisible();
  const listToggle = listGroup.getByRole("button", {
    name: /collapse 1 subtask/i,
  });
  await listToggle.click();
  await expect(listGroup.getByText(childTitle, { exact: true })).toHaveCount(0);
  await expect(
    listGroup.getByRole("button", { name: /expand 1 subtask/i }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
});
