import { describe, expect, it } from "vitest";
import { boardViewFromPathname, repoViewFromPathname } from "./board-view";

describe("boardViewFromPathname", () => {
  it("reads the current board view", () => {
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/gantt"),
    ).toBe("gantt");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/calendar"),
    ).toBe("calendar");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/backlog"),
    ).toBe("backlog");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/board"),
    ).toBe("board");
  });

  it("returns null off a board view, so callers fall back to the remembered one", () => {
    expect(boardViewFromPathname("/dashboard/organization/org1")).toBeNull();
    expect(
      boardViewFromPathname("/dashboard/settings/boards/b1/general"),
    ).toBeNull();
    // A repo path must never be read as a board view.
    expect(
      repoViewFromPathname("/dashboard/organization/org1/repo/r1/issues"),
    ).toBe("issues");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/repo/r1/issues"),
    ).toBeNull();
  });

  it("ignores a trailing segment after the view", () => {
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/gantt/t9"),
    ).toBe("gantt");
  });

  it("does not treat a board id as a view", () => {
    // "calendar" here is the board id — there is no view segment.
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/calendar"),
    ).toBeNull();
  });
});

describe("repoViewFromPathname", () => {
  it("reads each repo view", () => {
    for (const view of ["issues", "pulls", "code", "releases", "packages"]) {
      expect(
        repoViewFromPathname(`/dashboard/organization/org1/repo/r1/${view}`),
      ).toBe(view);
    }
  });

  it("returns null off a repo view", () => {
    expect(repoViewFromPathname("/dashboard/organization/org1")).toBeNull();
    // Board paths must never be read as a repo view.
    expect(
      repoViewFromPathname("/dashboard/organization/org1/board/b1/gantt"),
    ).toBeNull();
  });

  it("ignores a trailing segment after the view", () => {
    expect(
      repoViewFromPathname("/dashboard/organization/org1/repo/r1/issues/42"),
    ).toBe("issues");
  });
});
