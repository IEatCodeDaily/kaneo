import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

/**
 * This replaces an earlier, wrong implementation: the changed-files tree was a
 * Popover, so selecting a file dismissed it. Navigating several files meant
 * reopening the tree every time. It must be a persistent, toggleable sidebar
 * that survives a jump.
 */
test("changed-files tree is a persistent toggleable sidebar that survives file jumps", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
  );

  await page.getByRole("tab", { name: "Diffs" }).click();

  const sidebar = page.getByTestId("inline-file-tree-sidebar");
  const tree = page.getByTestId("inline-file-tree");
  const toggle = page.getByTestId("inline-file-tree-toggle");

  // Open by default, and it is a real sidebar rather than a popover.
  await expect(sidebar).toBeVisible();
  await expect(tree).toBeVisible();

  // It sits beside the diff, not on top of it: the diff keeps its own column to
  // the right of the sidebar.
  const sidebarBox = await sidebar.boundingBox();
  if (!sidebarBox) throw new Error("Missing sidebar bounding box");
  expect(sidebarBox.width).toBeGreaterThan(150);

  // Jump to a file. The tree must remain visible afterwards — that is the whole
  // point of the change.
  const fileEntry = tree.locator("[role=treeitem], button, a").first();
  await fileEntry.click();
  await expect(tree).toBeVisible();
  await expect(sidebar).toBeVisible();

  // Toggling collapses it to a button, and reopening restores the tree.
  await toggle.click();
  await expect(sidebar).toHaveCount(0);
  await expect(page.getByTestId("inline-file-tree-toggle")).toBeVisible();
  await page.getByTestId("inline-file-tree-toggle").click();
  await expect(page.getByTestId("inline-file-tree")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
