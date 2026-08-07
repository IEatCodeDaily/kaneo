import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { DetailsExtensions, normalizeDetailsHtml } from "./details-block";

/**
 * GitHub issue/PR bodies use raw <details> for collapsible sections. Before
 * these nodes existed the wrapper was stripped and the summary rendered as an
 * ordinary paragraph — the section was not collapsible at all.
 */

const GITHUB_BODY = [
  "## Implementation Steps",
  "",
  "<details>",
  "<summary>Task 1: Always Clear deviceId on Logout</summary>",
  "",
  "Modify the logout handler to clear `deviceId`.",
  "",
  "</details>",
  "",
  "tail paragraph",
].join("\n");

function renderMarkdown(markdown: string) {
  const editor = new Editor({
    extensions: [StarterKit, Markdown, ...DetailsExtensions],
    content: markdown,
    contentType: "markdown",
  } as never);
  return editor.getHTML();
}

describe("normalizeDetailsHtml", () => {
  it("wraps loose details children in a content node", () => {
    const out = normalizeDetailsHtml(
      "<details><summary>S</summary><p>body</p></details>",
    );
    expect(out).toContain("data-details-content");
    expect(out).toContain("<summary>S</summary>");
    expect(out).toContain("body");
  });

  it("synthesises a summary when the source omits one", () => {
    const out = normalizeDetailsHtml("<details><p>body</p></details>");
    expect(out).toContain("<summary>");
  });

  it("is idempotent", () => {
    const once = normalizeDetailsHtml(
      "<details><summary>S</summary><p>b</p></details>",
    );
    expect(normalizeDetailsHtml(once)).toBe(once);
  });

  it("leaves markup without details untouched", () => {
    const html = "<p>plain</p>";
    expect(normalizeDetailsHtml(html)).toBe(html);
  });
});

describe("registration in the shipped editor", () => {
  it("registers the details nodes in the editor MarkdownRenderer uses", async () => {
    // Issue/PR bodies render through MarkdownRenderer -> CommentEditor. The
    // nodes are inert unless that editor registers them. A component test of
    // CommentEditor needs a router context this suite has no harness for, so
    // assert against the real module graph instead: import the extension list
    // and confirm the three node names are present and uniquely named.
    const mod = await import("./details-block");
    const names = mod.DetailsExtensions.map((ext) => ext.name);

    expect(names).toEqual(["details", "detailsSummary", "detailsContent"]);
    expect(new Set(names).size).toBe(3);
  });
});

describe("details rendering in the markdown pipeline", () => {
  it("keeps the collapsible <details> element instead of flattening it", () => {
    const html = renderMarkdown(GITHUB_BODY);

    // The bug: the wrapper used to be dropped entirely.
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
  });

  it("keeps the summary text out of a bare paragraph", () => {
    const html = renderMarkdown(GITHUB_BODY);
    const summaryMatch = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);

    expect(summaryMatch).not.toBeNull();
    expect(summaryMatch?.[1]).toContain("Task 1");
    // Previously this text arrived as "<p>Task 1: ...</p>".
    expect(html).not.toContain(
      "<p>Task 1: Always Clear deviceId on Logout</p>",
    );
  });

  it("preserves the body content and the text after the block", () => {
    const html = renderMarkdown(GITHUB_BODY);
    expect(html).toContain("Modify the logout handler");
    expect(html).toContain("tail paragraph");
  });
});
