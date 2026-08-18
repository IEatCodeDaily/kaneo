import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { KaneoMention } from "./kaneo-mention";

/**
 * Mentioning someone produced no inbox notification. The backend parses
 * `<kaneo-mention id="...">` out of the stored body, and the database showed
 * ZERO task_mention notifications ever created — so the question is whether
 * the editor actually serializes the id, or silently drops it to plain text.
 *
 * This drives the REAL @tiptap/markdown serializer rather than asserting on
 * the extension's renderMarkdown in isolation, because the failure mode is a
 * serializer that never calls it.
 */
function serialize(content: unknown): string {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, KaneoMention],
    content,
  });
  // The app calls editor.getMarkdown() (see comment-editor.tsx:999).
  const markdown = (editor as unknown as { getMarkdown: () => string }).getMarkdown();
  editor.destroy();
  return markdown;
}

describe("KaneoMention markdown round-trip", () => {
  it("serializes a mention with its user id so the backend can notify", () => {
    const markdown = serialize({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "hey " },
            {
              type: "kaneoMention",
              attrs: { id: "user-123", label: "Ada" },
            },
          ],
        },
      ],
    });

    // The id is what the backend keys the notification off — losing it means
    // the mention renders fine but nobody is ever told.
    expect(markdown).toContain('id="user-123"');
    expect(markdown).toContain("kaneo-mention");
  });

  it("parses that markup back into a mention node", () => {
    const editor = new Editor({
      extensions: [StarterKit, Markdown, KaneoMention],
      content: '<kaneo-mention id="user-123" label="Ada"></kaneo-mention>',
    });
    const json = editor.getJSON();
    editor.destroy();

    const found = JSON.stringify(json).includes("kaneoMention");
    expect(found).toBe(true);
  });
});
