import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const f = loadFixtures();

test("Repos toggle hides both navigation surfaces and board providers remain", async ({
  page,
  pageErrors,
}) => {
  await gotoAndSettle(page, "/dashboard/settings/organization/features");
  const toggle = page.getByRole("switch", { name: "Enable Repos" });
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(toggle).toBeChecked();
  await gotoAndSettle(page, `/dashboard/organization/${f.organizationId}`);
  await expect(page.getByRole("button", { name: "Repos Beta" })).toBeVisible();
  await expect(page.getByText("Repos", { exact: true })).toHaveCount(2);

  await gotoAndSettle(page, "/dashboard/settings/organization/features");
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await gotoAndSettle(page, `/dashboard/organization/${f.organizationId}`);
  await expect(page.getByRole("button", { name: "Repos Beta" })).toHaveCount(0);
  await expect(page.getByText("Repos", { exact: true })).toHaveCount(0);

  await gotoAndSettle(
    page,
    `/dashboard/settings/boards/${f.boardId}/integrations`,
  );
  await expect(page.getByRole("heading", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gitea" })).toBeVisible();

  await gotoAndSettle(page, "/dashboard/settings/organization/features");
  const restoreToggle = page.getByRole("switch", { name: "Enable Repos" });
  if (!(await restoreToggle.isChecked())) await restoreToggle.click();
  await expect(restoreToggle).toBeChecked();
  expect(pageErrors).toEqual([]);
});
