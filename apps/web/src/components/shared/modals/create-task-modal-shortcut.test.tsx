import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { shortcuts } from "@/constants/shortcuts";
import { focusTaskTitleFromShortcut } from "./create-task-modal";

afterEach(cleanup);

describe("create task title shortcut", () => {
  it("focuses the title from a non-editable target while the modal is open", () => {
    const title = document.createElement("input");
    const action = document.createElement("button");
    document.body.append(title, action);
    action.addEventListener("keydown", (event) => {
      focusTaskTitleFromShortcut(event, title, true);
    });
    action.focus();
    fireEvent.keyDown(action, { key: shortcuts.task.focusTitle });
    expect(title).toHaveFocus();
  });

  it("does not hijack the shortcut while typing", () => {
    const title = document.createElement("input");
    const otherInput = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("tabindex", "0");
    document.body.append(title, otherInput, editor);
    const handler = (event: KeyboardEvent) => {
      focusTaskTitleFromShortcut(event, title, true);
    };
    otherInput.addEventListener("keydown", handler);
    editor.addEventListener("keydown", handler);
    otherInput.focus();
    fireEvent.keyDown(otherInput, { key: shortcuts.task.focusTitle });
    expect(otherInput).toHaveFocus();

    editor.focus();
    fireEvent.keyDown(editor, { key: shortcuts.task.focusTitle });
    expect(editor).toHaveFocus();
  });
});

describe("create task modal layout", () => {
  it("keeps properties inside the footer, outside the scroll body", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/shared/modals/create-task-modal.tsx",
      ),
      "utf8",
    );
    const scrollBody = source.indexOf('data-testid="create-task-scroll-body"');
    const stickyProperties = source.indexOf(
      'data-testid="create-task-sticky-properties"',
    );
    const footer = source.lastIndexOf("<DialogFooter", stickyProperties);

    expect(source.slice(scrollBody - 150, scrollBody)).toContain(
      "overflow-y-auto",
    );
    expect(footer).toBeGreaterThan(scrollBody);
    expect(stickyProperties).toBeGreaterThan(footer);
    expect(source.slice(footer, stickyProperties)).not.toContain("sticky");
  });
});
