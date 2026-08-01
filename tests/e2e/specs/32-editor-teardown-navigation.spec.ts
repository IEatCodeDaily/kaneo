import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * Navigating between a parent task and its subtask tears down the TipTap
 * editor. A destroyed editor is still truthy but its `commandManager` is null,
 * so effects guarded only by `if (!editor) return` still ran and threw
 * "can't access property commands", which TanStack Router surfaced as
 * "This view failed to load".
 *
 * Reproduced by round-tripping between a linked parent and subtask: without the
 * `editor.isDestroyed` guards this produced two error banners.
 */
test("round-tripping between a parent task and its subtask never breaks the view", async ({
  page,
}) => {
  test.skip(!fixtures.boardId, "no board available");

  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });

  // Build a real parent/subtask pair so the test does not depend on board data.
  const mk = async (title: string) => {
    const res = await page.request.post(`/api/task/${fixtures.boardId}`, {
      data: { title, description: "", priority: "medium", status: "to-do" },
    });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const stamp = Date.now();
  const parent = await mk(`Editor teardown parent ${stamp}`);
  const child = await mk(`Editor teardown child ${stamp}`);
  const rel = await page.request.post("/api/task-relation", {
    data: {
      sourceTaskId: parent.id,
      targetTaskId: child.id,
      relationType: "subtask",
    },
  });
  expect(rel.ok()).toBe(true);

  const taskUrl = (id: string) =>
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${id}`;

  await gotoAndSettle(page, taskUrl(parent.id));

  const failedView = page.getByText(/This view failed to (load|render)/);

  // IN-APP navigation, not page.goto. A full reload builds a fresh editor and
  // never reproduces this; the bug needs the router to swap the route while the
  // previous editor is being torn down. Clicking the subtask row and the parent
  // badge is exactly what a user does.
  const childRow = page.getByText(`Editor teardown child ${stamp}`).first();
  const parentRow = page.getByText(`Editor teardown parent ${stamp}`).first();

  for (let i = 0; i < 4; i += 1) {
    if (await childRow.count()) {
      await childRow.click();
      await page.waitForTimeout(700);
    }
    if (await parentRow.count()) {
      await parentRow.click();
      await page.waitForTimeout(700);
    }
  }
  await page.waitForTimeout(1500);

  await expect(failedView).toHaveCount(0);
  expect(
    consoleErrors.filter((entry) =>
      /commandManager|reading 'commands'/.test(entry),
    ),
  ).toEqual([]);
});
