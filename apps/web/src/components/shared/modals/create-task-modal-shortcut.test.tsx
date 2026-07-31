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