import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * #122: the team-view selector must scope the sidebar to the boards/repos the
 * SELECTED TEAM can access, not to the union of everything the signed-in user
 * can see. "All" is the unscoped view.
 *
 * This exercises the real HTTP path: the request the browser sends must carry
 * the teamId, and the API must answer with a team-resolved list.
 */
const fixtures = JSON.parse(
  readFileSync("tests/e2e/.auth/fixtures.json", "utf8"),
) as { baseURL: string; organizationId: string };

test.describe("#122 team view scopes accessible boards and repos", () => {
  test("selecting a team sends teamId and narrows the board list", async ({
    page,
    request,
  }) => {
    const { organizationId } = fixtures;

    // Ground truth straight from the API for the unscoped ("All") view.
    const allBoardsResponse = await request.get(
      `/api/board?organizationId=${organizationId}`,
    );
    expect(allBoardsResponse.ok()).toBe(true);
    const allBoards = (await allBoardsResponse.json()) as { id: string }[];

    const teamsResponse = await request.get(
      `/api/auth/organization/list-teams?organizationId=${organizationId}`,
    );
    const teams = teamsResponse.ok()
      ? ((await teamsResponse.json()) as { id: string; name: string }[])
      : [];
    test.skip(teams.length === 0, "organization has no teams to scope by");

    // Prefer a team that genuinely sees fewer boards than the user does —
    // scoping to a team with full access would prove nothing.
    let team = teams[0];
    let scopedBoards = allBoards;
    for (const candidate of teams) {
      const probe = await request.get(
        `/api/board?organizationId=${organizationId}&teamId=${candidate.id}`,
      );
      expect(probe.ok()).toBe(true);
      const probeBoards = (await probe.json()) as { id: string }[];
      if (probeBoards.length < allBoards.length) {
        team = candidate;
        scopedBoards = probeBoards;
        break;
      }
    }

    const allIds = new Set(allBoards.map((board) => board.id));
    for (const board of scopedBoards) {
      expect(allIds.has(board.id)).toBe(true);
    }
    expect(scopedBoards.length).toBeLessThanOrEqual(allBoards.length);

    // Now the browser path: picking the team must put teamId on the wire.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const scopedRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/api/board?") &&
        req.url().includes(`teamId=${team.id}`),
      { timeout: 20_000 },
    );

    await page.getByTestId("team-view-selector-value").click();
    await page.getByRole("menuitem", { name: team.name }).click();
    await scopedRequest;

    await expect(page.getByTestId("team-view-selector-value")).toHaveText(
      team.name,
    );

    const sidebar = page.locator('[data-slot="sidebar"]');
    await page.waitForTimeout(1500);
    const scopedRowCount = await sidebar
      .locator('[data-sidebar="menu-item"]')
      .count();

    // Back to "All": React Query may already hold the unscoped list, so assert
    // the restored state rather than requiring a fresh network round-trip.
    await page.getByTestId("team-view-selector-value").click();
    await page.getByRole("menuitem", { name: "All" }).click();
    await expect(page.getByTestId("team-view-selector-value")).toHaveText(
      "All",
    );
    await page.waitForTimeout(1500);

    const allRowCount = await sidebar
      .locator('[data-sidebar="menu-item"]')
      .count();

    // Scoping is a narrowing operation: "All" can never show fewer rows.
    expect(allRowCount).toBeGreaterThanOrEqual(scopedRowCount);

    // And when the API genuinely returns fewer boards for this team, the
    // sidebar must actually shrink — otherwise the selector is decorative.
    if (scopedBoards.length < allBoards.length) {
      expect(scopedRowCount).toBeLessThan(allRowCount);
    }
  });
});
