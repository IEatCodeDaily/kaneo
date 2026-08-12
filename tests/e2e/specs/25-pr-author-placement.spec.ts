import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("PR author sits beside the PR number like the issue header", async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
  );

  // Derive the author from the API; never hardcode a login.
  const detail = await page.request.get(
    `/api/repo/${fixtures.repoId}/pull-requests/${fixtures.pullNumber}`,
  );
  expect(detail.ok()).toBe(true);
  const authorLogin = (await detail.json()).authorLogin as string | null;
  if (!authorLogin) throw new Error("Fixture PR has no author login");

  // The master list stays mounted beside the detail pane and renders the same
  // number, so scope every locator to the detail article.
  const detailPane = page.locator("main article").first();
  const number = detailPane
    .getByText(`#${fixtures.pullNumber}`, { exact: true })
    .first();
  await expect(number).toBeVisible();
  const author = detailPane.getByTestId("repo-item-author").first();
  await expect(author).toContainText(authorLogin);

  const numberBox = await number.boundingBox();
  const authorBox = await author.boundingBox();
  if (!numberBox || !authorBox)
    throw new Error("Missing header bounding boxes");

  // Same row: vertical centers align, and the author follows the number.
  const numberCenter = numberBox.y + numberBox.height / 2;
  const authorCenter = authorBox.y + authorBox.height / 2;
  expect(Math.abs(numberCenter - authorCenter)).toBeLessThanOrEqual(6);
  expect(authorBox.x).toBeGreaterThan(numberBox.x);

  expect(pageErrors).toEqual([]);
});
