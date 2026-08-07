import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCreateTaskBoardId } from "./create-task-modal";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/shared/modals/create-task-modal.tsx",
  ),
  "utf8",
);

describe("create task board selection", () => {
  it("requires breadcrumb context outside a board route", () => {
    expect(resolveCreateTaskBoardId(undefined, null, "chosen-board")).toBe(
      "chosen-board",
    );
    expect(resolveCreateTaskBoardId(undefined, null, "")).toBe("");
  });

  it("preserves explicit board and board-route defaults", () => {
    expect(resolveCreateTaskBoardId("board-prop", null, "chosen-board")).toBe(
      "board-prop",
    );
    expect(
      resolveCreateTaskBoardId(undefined, "board-route", "chosen-board"),
    ).toBe("board-route");
  });

  it("puts outside-board selection in the breadcrumb overview dialog", () => {
    const breadcrumb = source.slice(
      source.indexOf("<DialogHeader"),
      source.indexOf("<form"),
    );
    const body = source.slice(
      source.indexOf("<form"),
      source.indexOf("{resolvedBoardId && ("),
    );

    expect(breadcrumb).toContain("settings:boardSwitcher.selectBoard");
    expect(breadcrumb).toContain("<Dialog");
    expect(breadcrumb).not.toContain('<nav aria-label="Boards"');
    expect(breadcrumb).toContain("settings:boardSwitcher.searchBoards");
    expect(breadcrumb).not.toContain("tasks:parentTask.searchPlaceholder");
    expect(body).not.toContain("boardPickerOpen");
  });

  it("uses resolved board context for the first crumb and always ends with New Ticket", () => {
    const breadcrumb = source.slice(
      source.indexOf("<BreadcrumbList>"),
      source.indexOf("</BreadcrumbList>"),
    );

    expect(breadcrumb).not.toContain("board?.slug");
    expect(breadcrumb).toContain("resolvedBoard?.slug?.toUpperCase()");
    expect(
      breadcrumb.indexOf("resolvedBoard?.slug?.toUpperCase()"),
    ).toBeLessThan(breadcrumb.indexOf("<BreadcrumbSeparator />"));
    expect(
      breadcrumb.slice(breadcrumb.indexOf("<BreadcrumbSeparator />")),
    ).toContain('t("common:modals.createTask.title")');
  });
});
