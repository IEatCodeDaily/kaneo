import { describe, expect, it } from "vitest";
import { boardViewFromPathname } from "./board-view";

describe("boardViewFromPathname", () => {
  it("keeps the current view so board switches don't reset to kanban", () => {
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/gantt"),
    ).toBe("gantt");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/calendar"),
    ).toBe("calendar");
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/backlog"),
    ).toBe("backlog");
  });

  it("defaults to the kanban board when no view segment is present", () => {
    expect(boardViewFromPathname("/dashboard/organization/org1")).toBe("board");
    expect(boardViewFromPathname("/dashboard/settings/boards/b1/general")).toBe(
      "board",
    );
  });

  it("ignores a trailing task id after the view segment", () => {
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/b1/gantt/t9"),
    ).toBe("gantt");
  });

  it("does not match a board named like a view", () => {
    // "calendar" here is the board id, not the view — there is no view segment.
    expect(
      boardViewFromPathname("/dashboard/organization/org1/board/calendar"),
    ).toBe("board");
  });
});
