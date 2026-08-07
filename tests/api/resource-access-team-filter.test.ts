import { describe, expect, it } from "vitest";
import { filterResourceIdsForTeam } from "../../apps/api/src/resource-access";

const grants = [
  {
    resourceId: "team-a-only",
    teamId: "team-a",
    userId: null,
    privilege: "view" as const,
  },
  {
    resourceId: "team-b-only",
    teamId: "team-b",
    userId: null,
    privilege: "view" as const,
  },
  {
    resourceId: "user-only",
    teamId: null,
    userId: "user-1",
    privilege: "admin" as const,
  },
  {
    resourceId: "team-a-none",
    teamId: "team-a",
    userId: null,
    privilege: "none" as const,
  },
];

/** #122: team scope answers what the selected team can access, not the user's union. */
describe("filterResourceIdsForTeam", () => {
  it("keeps resources granted to the selected team", () => {
    expect(
      filterResourceIdsForTeam({
        resourceIds: ["team-a-only"],
        grants,
        teamId: "team-a",
      }),
    ).toEqual(["team-a-only"]);
  });

  it("excludes resources granted only to another team", () => {
    expect(
      filterResourceIdsForTeam({
        resourceIds: ["team-b-only"],
        grants,
        teamId: "team-a",
      }),
    ).toEqual([]);
  });

  it("ignores user grants regardless of the caller's permission", () => {
    expect(
      filterResourceIdsForTeam({
        resourceIds: ["user-only"],
        grants,
        teamId: "team-a",
      }),
    ).toEqual([]);
  });

  it("respects an explicit none grant for the selected team", () => {
    expect(
      filterResourceIdsForTeam({
        resourceIds: ["team-a-none"],
        grants,
        teamId: "team-a",
      }),
    ).toEqual([]);
  });

  it("keeps organization-open resources that have no grants", () => {
    expect(
      filterResourceIdsForTeam({
        resourceIds: ["open"],
        grants,
        teamId: "team-a",
      }),
    ).toEqual(["open"]);
  });

  it("returns different lists for different selected teams", () => {
    const ids = ["team-a-only", "team-b-only", "user-only", "open"];
    expect(
      filterResourceIdsForTeam({ resourceIds: ids, grants, teamId: "team-a" }),
    ).toEqual(["team-a-only", "open"]);
    expect(
      filterResourceIdsForTeam({ resourceIds: ids, grants, teamId: "team-b" }),
    ).toEqual(["team-b-only", "open"]);
  });
});
