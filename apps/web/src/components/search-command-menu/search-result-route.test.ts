import { describe, expect, it } from "vitest";
import { getSearchResultRoute } from "./search-result-route";

describe("getSearchResultRoute", () => {
  it("uses organization and board slugs for board results", () => {
    expect(
      getSearchResultRoute(
        { type: "board", id: "board-uuid", boardSlug: "delivery" },
        "acme",
      ),
    ).toEqual({
      to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
      params: { organizationSlug: "acme", boardSlug: "delivery" },
    });
  });

  it("uses the organization slug for repository results", () => {
    expect(
      getSearchResultRoute(
        { type: "repository", id: "result", repoId: "repo-uuid" },
        "acme",
      ),
    ).toEqual({
      to: "/dashboard/organization/$organizationSlug/repo/$repoId/code",
      params: { organizationSlug: "acme", repoId: "repo-uuid" },
      search: { path: "" },
    });
  });
});
