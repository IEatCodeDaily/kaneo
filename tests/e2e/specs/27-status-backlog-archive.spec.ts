import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("status selector offers Move to Backlog and Archive below a divider", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // The fixture board carries no tasks, so create one for this run rather than
  // depending on seed data that may not exist.
  const created = await page.request.post(`/api/task/${fixtures.boardId}`, {
    data: {
      title: `Status selector probe ${Date.now()}`,
      description: "",
      priority: "medium",
      status: "to-do",
    },
  });
  expect(created.ok()).toBe(true);
  const task = await created.json();

  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${task.id}`,
  );

  // The sidebar renders several responsive variants of the status trigger and
  // only one is visible at a given viewport. `filter({ visible: true })` is
  // evaluated when the locator resolves, which can race hydration, so wait for
  // the visible one to settle before clicking it.
  const statusTrigger = page
    .getByTestId("task-status-trigger")
    .locator("visible=true")
    .first();
  await statusTrigger.waitFor({ state: "visible" });
  await statusTrigger.click();

  const backlog = page.getByRole("button", { name: "Move to Backlog" });
  const archive = page.getByRole("button", { name: "Archive", exact: true });
  const divider = page.getByTestId("status-divider");

  await expect(backlog).toBeVisible();
  await expect(archive).toBeVisible();
  await expect(divider).toBeVisible();

  // Placement, not just presence: both actions sit below the divider, so they
  // read as explicit actions rather than as additional board columns.
  const dividerBox = await divider.boundingBox();
  const backlogBox = await backlog.boundingBox();
  const archiveBox = await archive.boundingBox();
  if (!dividerBox || !backlogBox || !archiveBox)
    throw new Error("Missing status selector bounding boxes");
  expect(backlogBox.y).toBeGreaterThan(dividerBox.y);
  expect(archiveBox.y).toBeGreaterThan(backlogBox.y);

  // Selecting Move to Backlog must persist the planned status the Backlog
  // view reads, not merely close the popover.
  await backlog.click();
  await expect
    .poll(async () => {
      const detail = await page.request.get(`/api/task/${task.id}`);
      return detail.ok() ? (await detail.json()).status : null;
    })
    .toBe("planned");

  expect(pageErrors).toEqual([]);
});
