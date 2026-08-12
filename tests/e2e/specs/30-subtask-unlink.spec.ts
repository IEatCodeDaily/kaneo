import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Unlinking must break the parent/subtask relation only. The subtask itself has
 * to survive — that is what separates this from Delete.
 */
test("unlink removes the subtask relation without deleting the task", async ({
  page,
  pageErrors,
}) => {
  test.skip(!fixtures.boardId, "no board available");

  await page.setViewportSize({ width: 1440, height: 900 });

  const mk = async (title: string) => {
    const res = await page.request.post(`/api/task/${fixtures.boardId}`, {
      data: { title, description: "", priority: "medium", status: "to-do" },
    });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const stamp = Date.now();
  const parent = await mk(`Unlink parent ${stamp}`);
  const child = await mk(`Unlink child ${stamp}`);

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

  const row = page.getByText(`Unlink child ${stamp}`).first();
  await expect(row).toBeVisible();

  // Unlink lives on the row's right-click menu.
  await row.click({ button: "right" });
  const unlink = page.getByRole("menuitem", { name: "Unlink subtask" });
  await expect(unlink).toBeVisible();
  await unlink.click();

  // The relation is gone...
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/task-relation/${parent.id}`);
      if (!res.ok()) return null;
      const relations = await res.json();
      return (relations as Array<{ targetTaskId?: string }>).filter(
        (r) => r.targetTaskId === child.id,
      ).length;
    })
    .toBe(0);

  // ...but the subtask itself still exists. Unlink is not a delete.
  const stillThere = await page.request.get(`/api/task/${child.id}`);
  expect(stillThere.ok()).toBe(true);
  expect((await stillThere.json()).id).toBe(child.id);

  expect(pageErrors).toEqual([]);
});
