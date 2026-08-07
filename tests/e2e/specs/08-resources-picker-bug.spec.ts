import { expect, test } from "@playwright/test";

/**
 * Reproduction for "Bug: Task Resources Link Show no Issue/PR".
 *
 * The Resources *rows* render fine (covered by 08-resources-bug-repro).
 * The real defect is in the LINK PICKER: task-resources.tsx derives a single
 *
 *     const primaryRepoId = repos.length > 0 ? repos[0].id : "";
 *
 * and only fetches issues/PRs for that one repo. The organization has 5 repos
 * and repos[0] (IEatCodeDaily/kaneo) has 0 issues, so opening the picker and
 * choosing "Issues" shows nothing — even though 19 issues exist across the
 * other repos.
 *
 * DB ground truth (organization Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5):
 *   IEatCodeDaily/kaneo                            issues=0   prs=6
 *   IEatCodeDaily/kaneo-board-sync-alpha-...       issues=1   prs=0
 *   IEatCodeDaily/kaneo-board-sync-beta-...        issues=4   prs=1
 *   IEatCodeDaily/kaneo-test                       issues=13  prs=7
 *   kaneo-e2e/repo-fixtures                        issues=1   prs=1
 *
 * So the picker must offer issues from more than one repository.
 */

const TASK = {
  id: "aosuhtxk9usb3nb1b3r8g3nz",
  board: "6736p3cm5ty5e80hg436zhxu",
};

test("link picker offers issues from every connected repo, not just repos[0]", async ({
  page,
}) => {
  const issueCalls: { repoId: string; count: number }[] = [];

  page.on("response", async (res) => {
    const m = res.url().match(/\/repo\/([^/]+)\/issues\?/);
    if (!m) return;
    let count = -1;
    try {
      const body = await res.json();
      count = Array.isArray(body?.data) ? body.data.length : -1;
    } catch {
      /* ignore */
    }
    issueCalls.push({ repoId: m[1], count });
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const orgId = page.url().split("/organization/")[1]?.split("/")[0];

  await page.goto(
    `/dashboard/organization/${orgId}/board/${TASK.board}/task/${TASK.id}`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(3500);

  // Open the link picker.
  await page
    .getByRole("button", { name: /Link issue or pull request/i })
    .click();
  await page.waitForTimeout(2500);

  // Make sure we are on the Issues tab.
  const issuesTab = page.getByRole("button", { name: /^Issues$/ });
  if (await issuesTab.isVisible().catch(() => false)) {
    await issuesTab.click();
    await page.waitForTimeout(2000);
  }

  const picker = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog)
      return { open: false, groups: [] as string[], items: 0, empty: "" };
    const groups = Array.from(
      dialog.querySelectorAll("[data-slot='command-group-label']"),
    ).map((el) => (el.textContent || "").trim());
    const items = dialog.querySelectorAll("[data-slot='command-item']").length;
    const empty = (dialog.textContent || "").includes("No issues found")
      ? "No issues found"
      : "";
    return { open: true, groups, items, empty };
  });

  console.log("ISSUE CALLS:", JSON.stringify(issueCalls));
  console.log("PICKER:", JSON.stringify(picker));
  await page.screenshot({ path: "/tmp/picker-issues.png", fullPage: true });

  expect(picker.open, "link picker did not open").toBe(true);

  // The bug: only ONE repo is ever queried for issues.
  const queriedRepos = new Set(issueCalls.map((c) => c.repoId));
  expect(
    queriedRepos.size,
    `picker only queried ${queriedRepos.size} repo(s) (${[...queriedRepos].join(", ")}) — it must query every connected repo`,
  ).toBeGreaterThan(1);

  // And the user-visible consequence: no issues offered at all.
  expect(
    picker.items,
    `picker showed ${picker.items} items / empty-state="${picker.empty}" despite 19 issues existing across the organization's repos`,
  ).toBeGreaterThan(0);
});
