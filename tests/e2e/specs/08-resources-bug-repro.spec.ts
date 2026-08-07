import { expect, test } from "@playwright/test";

/**
 * Reproduction for "Bug: Task Resources Link Show no Issue/PR".
 *
 * The API is already proven to return links for these tasks:
 *   /api/task/aosuhtxk9usb3nb1b3r8g3nz/repo-links -> 2 items (issue #13, PR #9)
 *   /api/task/ebhlwg3r1sxgxwoag36wj58a/repo-links -> 1 item  (issue #16)
 *
 * So this spec asserts the UI renders what the API returns. It captures the
 * network response alongside the DOM so a failure tells us which side is wrong
 * rather than just "element not found".
 */

const TASKS = [
  {
    id: "aosuhtxk9usb3nb1b3r8g3nz",
    board: "6736p3cm5ty5e80hg436zhxu",
    expected: 2,
    label: "issue #13 + PR #9",
  },
  {
    id: "ebhlwg3r1sxgxwoag36wj58a",
    board: "yiw0az2cmtbz18035a6jdme3",
    expected: 1,
    label: "issue #16",
  },
];

for (const task of TASKS) {
  test(`task ${task.id} renders its linked resources (${task.label})`, async ({
    page,
  }) => {
    const apiPayloads: { url: string; status: number; count: number }[] = [];
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (!/repo-links|external-link\/task/.test(url)) return;
      let count = -1;
      try {
        const body = await res.json();
        count = Array.isArray(body) ? body.length : -1;
      } catch {
        /* non-JSON */
      }
      apiPayloads.push({ url, status: res.status(), count });
    });

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const orgId = page.url().split("/organization/")[1]?.split("/")[0];
    expect(orgId, "could not resolve organization id").toBeTruthy();

    await page.goto(
      `/dashboard/organization/${orgId}/board/${task.board}/task/${task.id}`,
      { waitUntil: "domcontentloaded" },
    );

    // Wait for the row to actually exist rather than racing a fixed timeout —
    // the earlier fixed-sleep version of this spec was flaky for that reason.
    const readRows = () =>
      page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll("span")).find(
          (s) => s.textContent?.trim() === "Resources",
        );
        const section = heading?.closest("section");
        if (!section) return { sectionFound: false, rows: [] as string[] };
        // Count only the resource anchors; the "Link issue or pull request"
        // call-to-action is a <button>, so it is naturally excluded.
        const rows = Array.from(section.querySelectorAll("a[href]"))
          .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean);
        return { sectionFound: true, rows };
      });

    await expect
      .poll(async () => (await readRows()).rows.length, {
        message: `Resources section never rendered ${task.expected} row(s)`,
        timeout: 20000,
      })
      .toBeGreaterThanOrEqual(task.expected);

    const info = await readRows();

    console.log(`API   ${task.id}:`, JSON.stringify(apiPayloads));
    console.log(`ROWS  ${task.id}:`, JSON.stringify(info));
    if (consoleErrors.length) {
      console.log(`CONSOLE ERRORS ${task.id}:`, consoleErrors.slice(0, 5));
    }
    await page.screenshot({
      path: `/tmp/resources-${task.id}.png`,
      fullPage: true,
    });

    expect(info.sectionFound, "Resources section did not render at all").toBe(
      true,
    );

    const repoLinkCall = apiPayloads.find((p) => p.url.includes("repo-links"));
    expect(repoLinkCall, "the UI never called /repo-links").toBeTruthy();
    expect(repoLinkCall?.status, "/repo-links did not return 200").toBe(200);
    expect(
      repoLinkCall?.count,
      "/repo-links returned fewer items than the DB holds",
    ).toBeGreaterThanOrEqual(task.expected);

    // The actual bug assertion: the API returned N links, so N rows must render.
    expect(
      info.rows.length,
      `API returned ${repoLinkCall?.count} link(s) but the Resources section rendered ${info.rows.length} row(s)`,
    ).toBeGreaterThanOrEqual(task.expected);
  });
}
