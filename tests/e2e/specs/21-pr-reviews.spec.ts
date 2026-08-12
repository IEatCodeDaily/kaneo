import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test("pull request reviews tab lists reviews and inline threads", async ({
  page,
  pageErrors,
}) => {
  // Reviews are read through to GitHub, so they are stubbed here to assert the
  // rendering contract deterministically.
  await page.route("**/api/repo/*/pull-requests/*/reviews", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        reviews: [
          {
            id: 1,
            state: "APPROVED",
            body: "Looks good to me.",
            submittedAt: "2026-07-30T10:00:00Z",
            authorLogin: "octocat",
            authorAvatarUrl: null,
            url: "https://example.test/r/1",
          },
          {
            id: 2,
            state: "CHANGES_REQUESTED",
            body: "Please rename this.",
            submittedAt: "2026-07-30T11:00:00Z",
            authorLogin: "hubot",
            authorAvatarUrl: null,
            url: "https://example.test/r/2",
          },
        ],
        comments: [
          {
            id: 10,
            body: "This name is misleading.",
            path: "src/first.ts",
            line: 3,
            side: "RIGHT",
            createdAt: "2026-07-30T11:01:00Z",
            authorLogin: "hubot",
            authorAvatarUrl: null,
            url: "https://example.test/c/10",
            inReplyToId: null,
          },
          {
            id: 11,
            body: "Agreed, renaming.",
            path: "src/first.ts",
            line: 3,
            side: "RIGHT",
            createdAt: "2026-07-30T11:05:00Z",
            authorLogin: "octocat",
            authorAvatarUrl: null,
            url: "https://example.test/c/11",
            inReplyToId: 10,
          },
        ],
      }),
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(
    page,
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`,
  );

  const tabs = page.getByRole("tablist", { name: "Pull request sections" });
  await tabs.getByRole("tab", { name: "Reviews", exact: true }).click();

  await expect(page.getByText("approved these changes")).toBeVisible();
  await expect(page.getByText("requested changes")).toBeVisible();

  // Replies group under the comment they answer: one thread, not two headers.
  const threads = page.getByTestId("review-thread");
  await expect(threads).toHaveCount(1);
  await expect(threads.first()).toContainText("src/first.ts");
  await expect(threads.first()).toContainText("This name is misleading.");
  await expect(threads.first()).toContainText("Agreed, renaming.");

  // Approve needs no comment; the other verdicts do.
  await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Request changes" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Review comment" })
    .fill("Needs work");
  await expect(
    page.getByRole("button", { name: "Request changes" }),
  ).toBeEnabled();

  expect(pageErrors).toEqual([]);
});
