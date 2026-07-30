import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("pull request list and detail show the diff delta", async ({
  page,
  pageErrors,
}) => {
  // The seeded fixture pull requests carry no mirrored diff counts, so the
  // delta is stubbed here to assert rendering and placement deterministically.
  await page.route("**/api/repo/*/pull-requests?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        data: (body.data ?? []).map(
          (pullRequest: Record<string, unknown>, index: number) =>
            index === 0
              ? {
                  ...pullRequest,
                  additions: 2520,
                  deletions: 2,
                  changedFiles: 62,
                }
              : pullRequest,
        ),
      },
    });
  });
  await page.route(/\/api\/repo\/[^/]+\/pull-requests\/\d+$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, additions: 2520, deletions: 2, changedFiles: 62 },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls?state=all`,
  );

  const rowDelta = page
    .locator('[data-slot="repo-list-row"] [data-slot="repo-diff-delta"]')
    .first();
  await expect(rowDelta).toBeVisible();
  await expect(rowDelta).toHaveText("+2520−2");

  // Placement, not just presence: right-aligned on the metadata row, and
  // vertically below the labels rather than beside the title.
  const row = page.locator('[data-slot="repo-list-row"]').first();
  const labels = row.locator('[data-slot="repo-label-list"]').first();
  const rowBox = await row.boundingBox();
  const deltaBox = await rowDelta.boundingBox();
  const labelsBox = await labels.boundingBox();
  if (!rowBox || !deltaBox || !labelsBox)
    throw new Error("Missing pull request row bounding boxes");
  // Right-aligned: hugs the row's trailing edge.
  expect(rowBox.x + rowBox.width - (deltaBox.x + deltaBox.width)).toBeLessThan(
    24,
  );
  // Below the labels: the delta's top clears the labels' bottom.
  expect(deltaBox.y).toBeGreaterThanOrEqual(labelsBox.y + labelsBox.height - 2);

  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
  );
  // Scoped by test id: the master list stays mounted beside the detail pane and
  // renders its own delta.
  const detailDelta = page.getByTestId("pull-request-diff-delta");
  await expect(detailDelta).toBeVisible();
  await expect(detailDelta).toHaveText("62 files+2520−2");
  expect(pageErrors).toEqual([]);
});
