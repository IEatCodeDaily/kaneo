import fs from "node:fs";
import path from "node:path";
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

  it("uses the searchable popover pattern instead of a native select", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/components/shared/modals/create-task-modal.tsx",
      ),
      "utf8",
    );
    const picker = source.slice(
      source.indexOf("{!boardId && !routeBoardId && ("),
      source.indexOf("{resolvedBoardId && ("),
    );

    expect(picker).toContain("<Popover");
    expect(picker).toContain("<Input");
    expect(picker).not.toContain("<select");
    expect(picker).toContain(
      'aria-label={t("settings:boardSwitcher.selectBoard")}',
    );
  });
});
