import { describe, expect, it } from "vitest";
import { resolveCreateTaskBoardId } from "./create-task-modal";

describe("create task board selection", () => {
  it("requires an explicit choice outside a board route", () => {
    expect(resolveCreateTaskBoardId(undefined, null, "stale-board", "")).toBe(
      "",
    );
  });

  it("preserves explicit board and backlog defaults", () => {
    expect(
      resolveCreateTaskBoardId("board-prop", null, "stale-board", ""),
    ).toBe("board-prop");
    expect(
      resolveCreateTaskBoardId(undefined, "board-route", "stale-board", ""),
    ).toBe("board-route");
  });

  it("uses the board selected in the modal", () => {
    expect(
      resolveCreateTaskBoardId(undefined, null, "stale-board", "chosen-board"),
    ).toBe("chosen-board");
  });
});
