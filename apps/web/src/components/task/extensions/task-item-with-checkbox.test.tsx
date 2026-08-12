import { Editor } from "@tiptap/core";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskItemWithCheckbox } from "./task-item-with-checkbox";

vi.mock("react-i18next", async () => {
  const actual =
    await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock("@/lib/i18n", () => ({ i18n: { language: "en" } }));

let editor: Editor | null = null;

function mountEditor() {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [
      StarterKit,
      TaskList,
      TaskItemWithCheckbox.configure({ nested: true }),
    ],
    content: "",
  });
  return editor;
}

function taskItemTexts(active: Editor) {
  const texts: string[] = [];
  active.state.doc.descendants((node) => {
    if (node.type.name === "taskItem") texts.push(node.textContent);
    return true;
  });
  return texts;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

/**
 * #267 regression cover.
 *
 * IMPORTANT — what these tests can and cannot prove. The actual user-visible
 * bug (Enter splits the item but the caret stays behind, so the next keystrokes
 * merge into the first item) is a *browser selection* bug. jsdom does not
 * implement enough of the selection/DOM-position machinery to reproduce it:
 * `splitListItem` reports success under jsdom even with the broken
 * `ReactNodeViewRenderer` implementation. Verified by reverting the source and
 * re-running — the two `splitListItem` cases below stayed green.
 *
 * So the load-bearing test here is the DOM-structure one: it pins the plain-DOM
 * node view shape (a non-editable checkbox host as a sibling of the ProseMirror
 * content host) that the fix depends on, and it *does* fail against the React
 * renderer. The split/typing tests guard the command contract and the checkbox
 * attribute wiring, not the caret placement.
 *
 * End-to-end caret behaviour is covered by driving a real browser with OS-level
 * key events; see the #267 notes on the ticket.
 */
describe("TaskItemWithCheckbox", () => {
  it("renders a non-editable checkbox host beside the ProseMirror content host", () => {
    // This is the assertion that fails against ReactNodeViewRenderer: the React
    // wrapper injects its own elements around `contentDOM`, which is what broke
    // ProseMirror's DOM-position mapping and stranded the caret.
    const active = mountEditor();
    active.commands.toggleTaskList();
    active.commands.insertContent("first");

    const listItem = active.view.dom.querySelector('li[data-type="taskItem"]');
    expect(listItem).not.toBeNull();

    // The checkbox host must be non-editable and must not contain the text.
    const checkboxHost = listItem?.querySelector(".kaneo-task-item-checkbox");
    expect(checkboxHost).not.toBeNull();
    expect(checkboxHost?.getAttribute("contenteditable")).toBe("false");
    expect(checkboxHost?.textContent).not.toContain("first");

    // The paragraph holding the text is a direct child of the content host,
    // which is itself a direct child of the <li> and a sibling of the checkbox.
    const paragraph = listItem?.querySelector("p");
    expect(paragraph?.textContent).toBe("first");
    const contentHost = paragraph?.parentElement;
    expect(contentHost).not.toBe(checkboxHost);
    expect(contentHost?.parentElement).toBe(listItem);
    expect(contentHost?.previousElementSibling).toBe(checkboxHost);
  });

  it("splits a checklist item into a second item and moves the selection there", () => {
    const active = mountEditor();
    active.commands.toggleTaskList();
    active.commands.insertContent("first");

    const splitBefore = active.state.selection.from;
    expect(active.commands.splitListItem("taskItem")).toBe(true);

    // Two items now exist...
    expect(taskItemTexts(active)).toEqual(["first", ""]);
    // ...and the selection advanced past the first item's content, which is
    // what makes the next keystroke land in item two.
    expect(active.state.selection.from).toBeGreaterThan(splitBefore);
    expect(active.state.selection.$from.parent.textContent).toBe("");

    active.commands.insertContent("second");
    expect(taskItemTexts(active)).toEqual(["first", "second"]);
  });

  it("keeps checkbox state per item when toggling attributes", () => {
    const active = mountEditor();
    active.commands.toggleTaskList();
    active.commands.insertContent("first");
    active.commands.splitListItem("taskItem");
    active.commands.insertContent("second");

    // Toggle the first item only.
    let firstPos: number | undefined;
    active.state.doc.descendants((node, pos) => {
      if (node.type.name === "taskItem" && firstPos === undefined) {
        firstPos = pos;
      }
      return true;
    });
    expect(firstPos).toBeTypeOf("number");
    active.view.dispatch(
      active.state.tr.setNodeMarkup(firstPos as number, undefined, {
        checked: true,
      }),
    );

    const checkedStates: boolean[] = [];
    active.state.doc.descendants((node) => {
      if (node.type.name === "taskItem") {
        checkedStates.push(Boolean(node.attrs.checked));
      }
      return true;
    });
    expect(checkedStates).toEqual([true, false]);
    expect(taskItemTexts(active)).toEqual(["first", "second"]);
  });
});
