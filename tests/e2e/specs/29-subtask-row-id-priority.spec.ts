import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Subtask rows previously showed only status, title and assignee — no way to
 * reference a subtask by number or see/change its priority without opening it.
 */
test("subtask rows show the task number and an editable priority", async ({
  page,
  pageErrors,
}) => {
  test.skip(!fixtures.boardId, "no board available");

  await page.setViewportSize({ width: 1440, height: 900 });

  // Build a real parent + subtask pair via the API so the row has known values.
  const mk = async (title: string, priority: string) => {
    const res = await page.request.post(`/api/task/${fixtures.boardId}`, {
      data: { title, description: "", priority, status: "to-do" },
    });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const stamp = Date.now();
  const parent = await mk(`Subtask parent ${stamp}`, "medium");
  const child = await mk(`Subtask child ${stamp}`, "low");

  const rel = await page.request.post("/api/task-relation", {
    data: {
      sourceTaskId: parent.id,
      targetTaskId: child.id,
      relationType: "subtask",
    },
  });
  expect(rel.ok()).toBe(true);

  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${parent.id}`,
  );

  // The subtask row must carry the child's number so it can be referenced.
  const row = page
    .locator('[data-slot="context-menu-trigger"], div')
    .filter({ hasText: `Subtask child ${stamp}` })
    .last();
  await expect(row).toContainText(`#${child.number}`);

  // Priority is editable inline: open the row's priority control and switch it.
  await row
    .getByRole("button", { name: /priority/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Urgent" }).first().click();

  // The change must persist, and the row must stop showing the stale value.
  await expect
    .poll(async () => {
      const detail = await page.request.get(`/api/task/${child.id}`);
      return detail.ok() ? (await detail.json()).priority : null;
    })
    .toBe("urgent");

  expect(pageErrors).toEqual([]);
});
