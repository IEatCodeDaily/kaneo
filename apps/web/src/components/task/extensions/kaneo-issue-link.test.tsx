import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vitest";
import { formatTaskMarkdown } from "../task-markdown";
import { KaneoIssueLink } from "./kaneo-issue-link";

/**
 * #128: "Ticket Mention in Description doesn't show the mention."
 *
 * A mention saved into a description came back as
 *   <kaneo-issue-link url="/..." issue-key="" task-id="" />
 * — both identifying attributes empty, so nothing could be rendered.
 *
 * Root cause: `addAttributes` declared camelCase keys (`issueKey`, `taskId`)
 * with no per-attribute `parseHTML`. Tiptap's default parser then looked for
 * DOM attributes literally named `issueKey`/`taskId`, while `renderHTML` wrote
 * kebab-case `issue-key`/`task-id`. The values never round-tripped.
 *
 * These tests drive a REAL editor and assert the round-trip, so they fail if
 * the parse/serialise pair ever drifts apart again.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

function editorWith(html: string) {
  return new Editor({
    extensions: [StarterKit, KaneoIssueLink],
    content: html,
  });
}

/**
 * The node is INLINE, so it lands inside a paragraph rather than at the top
 * level of the doc. Walk to it instead of assuming doc.child(0).
 */
function issueLinkNode(editor: Editor): { attrs: Record<string, unknown> } {
  const matches: { attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "kaneoIssueLink") {
      matches.push({ attrs: node.attrs as Record<string, unknown> });
    }
    return matches.length === 0;
  });
  const first = matches[0];
  if (!first) throw new Error("kaneoIssueLink node not found in document");
  return first;
}

const KEY = "github-sync-beta#8";
const TASK_ID = "cluhlrxbldiwnqqcjmgenh06";
const URL = `/dashboard/organization/org1/board/board1/task/${TASK_ID}`;

describe("#128 kaneo-issue-link attribute round-trip", () => {
  it("parses issue-key and task-id off the stored markup", () => {
    const editor = editorWith(
      `<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}"></kaneo-issue-link>`,
    );

    const node = issueLinkNode(editor);

    expect(node.attrs.issueKey).toBe(KEY);
    expect(node.attrs.taskId).toBe(TASK_ID);
    expect(node.attrs.url).toBe(URL);
    editor.destroy();
  });

  it("survives a full serialise -> parse cycle without losing its identity", () => {
    const first = editorWith(
      `<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}"></kaneo-issue-link>`,
    );
    const serialised = first.getHTML();
    first.destroy();

    // The serialised form is what gets persisted to the description.
    expect(serialised).toContain(`issue-key="${KEY}"`);
    expect(serialised).toContain(`task-id="${TASK_ID}"`);
    expect(serialised).not.toContain('issue-key=""');
    expect(serialised).not.toContain('task-id=""');

    const second = editorWith(serialised);
    const node = issueLinkNode(second);
    expect(node.attrs.issueKey).toBe(KEY);
    expect(node.attrs.taskId).toBe(TASK_ID);
    second.destroy();
  });

  /**
   * The more damaging half of #128. `<kaneo-issue-link ... />` is not valid
   * HTML for a non-void element, so the parser treats it as an OPEN tag and
   * swallows every sibling that follows — the mention rendered blank AND the
   * rest of the description vanished.
   */
  it("does not swallow the content that follows it", () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
        KaneoIssueLink,
      ],
      content: "",
    });
    editor.commands.setContent(
      formatTaskMarkdown(
        `before the mention\n\n<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}" />\n\nafter the mention`,
      ),
    );

    const text = editor.state.doc.textContent;
    expect(text).toContain("before the mention");
    // This is what regressed: everything after the mention was lost.
    expect(text).toContain("after the mention");
    editor.destroy();
  });

  /**
   * Exercises renderMarkdown — the MARKDOWN serializer, which is what actually
   * gets persisted. getHTML() goes through renderHTML and would pass even with
   * a self-closing markdown serializer, so asserting on it proves nothing.
   */
  it("serialises markdown with an explicit closing tag, never self-closing", () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
        KaneoIssueLink,
      ],
      content: "",
    });
    editor.commands.setContent(
      `<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}"></kaneo-issue-link>`,
    );

    const markdown = (
      editor as unknown as { getMarkdown: () => string }
    ).getMarkdown();
    expect(markdown).toContain("</kaneo-issue-link>");
    // A self-closing tag is what swallowed the rest of the description.
    expect(markdown).not.toMatch(/<kaneo-issue-link[^>]*\/>/);
    editor.destroy();
  });

  it("repairs legacy self-closing markup already in the database", () => {
    const legacy = `<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}" />`;
    const repaired = formatTaskMarkdown(legacy);
    expect(repaired).toBe(
      `<kaneo-issue-link url="${URL}" issue-key="${KEY}" task-id="${TASK_ID}"></kaneo-issue-link>`,
    );
  });

  it("also accepts the data- prefixed form", () => {
    const editor = editorWith(
      `<kaneo-issue-link url="${URL}" data-issue-key="${KEY}" data-task-id="${TASK_ID}"></kaneo-issue-link>`,
    );

    const node = issueLinkNode(editor);
    expect(node.attrs.issueKey).toBe(KEY);
    expect(node.attrs.taskId).toBe(TASK_ID);
    editor.destroy();
  });
});
