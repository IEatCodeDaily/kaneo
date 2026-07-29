import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("Pierre tree selection opens the file in Pierre CodeView", async ({
  page,
  pageErrors,
}) => {
  test.skip(!fixtures.repoId, "no repo fixture available");
  await page.route("**/api/repo/*/tree*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ref: "main",
        truncated: false,
        entries: [
          {
            path: "verified.ts",
            name: "verified.ts",
            type: "file",
            sha: "fixture-sha",
            size: 25,
            url: "https://example.test/tree",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/repo/*/contents*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        path: "verified.ts",
        ref: "main",
        type: "file",
        entries: [],
        file: {
          type: "file",
          name: "verified.ts",
          path: "verified.ts",
          sha: "fixture-sha",
          size: 25,
          content: "export const verified = true;",
          isBinary: false,
        },
      }),
    }),
  );

  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/code`,
  );
  const explorer = page.getByLabel("File explorer");
  await expect(explorer).toBeVisible();
  // Pierre owns the row DOM inside its web-component render surface. The
  // deterministic fixture has one row, so exercise the same pointer click a
  // user performs instead of coupling the test to private shadow internals.
  await explorer.click({ position: { x: 90, y: 20 } });
  await expect(page.getByLabel("File viewer")).toBeVisible();
  await expect(page.locator("diffs-container")).toHaveCount(1);
  await expect(
    page.getByText("export const verified = true;", { exact: false }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
