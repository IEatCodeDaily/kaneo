import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { describe, expect, it } from "vitest";
import {
  DetailsExtensions,
  inlineDetailsBlocks,
} from "@/components/task/extensions/details-block";

/**
 * A GitHub/CodeRabbit issue body: blank lines inside `<details>`, and a nested
 * `<details>` inside the outer one. This is the shape that rendered flat.
 */
const CODERABBIT_BODY = `Here is the plan.

<details>
<summary>📋 Implementation Steps</summary>

Task 3

- Define Events in \`droppy_assistant_event.dart\`
- Define State with copyWith and props

<details>
<summary><b>💡 Iterate on the plan</b></summary>

Example Feedback
- skip phase 3
- add a unit test

</details>

</details>

Trailing paragraph.`;

const render = (md: string) =>
  marked.parse(md, { async: false, breaks: false, gfm: true });

function toHtml(markdown: string) {
  const editor = new Editor({
    extensions: [StarterKit, ...DetailsExtensions, Markdown],
    content: inlineDetailsBlocks(markdown, render),
    contentType: "markdown",
  });
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

/** Text inside the first fold, i.e. what the browser hides when collapsed. */
function foldBody(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const content = doc.querySelector("details [data-details-content]");
  return content?.textContent?.trim() ?? "";
}

describe("GitHub <details> bodies stay inside the fold", () => {
  it("keeps the body nested instead of leaking it to the top level", () => {
    const html = toHtml(CODERABBIT_BODY);
    const body = foldBody(html);

    // the defect: fold rendered empty and the body appeared as siblings below
    expect(body).not.toBe("");
    expect(body).toContain("Define Events");
    expect(body).toContain("Define State");
  });

  it("does not leave the body as a sibling of the details element", () => {
    const doc = new DOMParser().parseFromString(
      toHtml(CODERABBIT_BODY),
      "text/html",
    );
    const topLevel = Array.from(doc.body.children)
      .filter((el) => el.tagName !== "DETAILS")
      .map((el) => el.textContent ?? "")
      .join(" ");

    expect(topLevel).toContain("Here is the plan");
    expect(topLevel).toContain("Trailing paragraph");
    // these belong inside the fold, not beside it
    expect(topLevel).not.toContain("Define Events");
    expect(topLevel).not.toContain("Iterate on the plan");
  });

  it("nests a details inside a details", () => {
    const doc = new DOMParser().parseFromString(
      toHtml(CODERABBIT_BODY),
      "text/html",
    );
    const outer = doc.querySelector("details");
    expect(outer).not.toBeNull();
    expect(outer?.querySelector("details")).not.toBeNull();
    expect(doc.querySelectorAll("details")).toHaveLength(2);
  });

  it("keeps the summary label", () => {
    const doc = new DOMParser().parseFromString(
      toHtml(CODERABBIT_BODY),
      "text/html",
    );
    const summaries = Array.from(doc.querySelectorAll("summary")).map((s) =>
      (s.textContent ?? "").trim(),
    );
    expect(summaries[0]).toContain("Implementation Steps");
    expect(summaries.join(" ")).toContain("Iterate on the plan");
  });

  it("leaves markdown without details untouched", () => {
    const plain = "# Title\n\nSome **bold** text.\n";
    expect(inlineDetailsBlocks(plain, render)).toBe(plain);
  });

  it("preserves list structure inside the fold", () => {
    const html = toHtml(CODERABBIT_BODY);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const list = doc.querySelector("details [data-details-content] ul");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
  });

  it("round-trips: saving the document keeps every details section", () => {
    /*
      The save path serializes back to markdown via getMarkdown(). Without
      renderMarkdown handlers on the details nodes, @tiptap/markdown silently
      dropped the subtree — the first autosave after opening a GitHub body
      DELETED all collapsible sections from the stored description.
    */
    const editor = new Editor({
      extensions: [StarterKit, ...DetailsExtensions, Markdown],
      content: inlineDetailsBlocks(CODERABBIT_BODY, render),
      contentType: "markdown",
    });
    const saved = editor.getMarkdown();
    editor.destroy();

    expect(saved).toContain("<details");
    expect(saved).toContain("</details>");
    expect(saved).toContain("<summary>");
    expect(saved).toContain("Define Events");
    // both sections survive, including the nested one
    expect(saved.match(/<details/g)?.length).toBe(2);

    // and the saved form loads back with the folds intact (steady state)
    const again = toHtml(saved);
    const doc = new DOMParser().parseFromString(again, "text/html");
    expect(doc.querySelectorAll("details")).toHaveLength(2);
    expect(
      doc.querySelector("details [data-details-content]")?.textContent,
    ).toContain("Define Events");
    // the serializer writes bold summaries as `**…**`; reload must render
    // them as <strong>, not leak literal asterisks into the label
    const summaryTexts = Array.from(doc.querySelectorAll("summary")).map(
      (s) => s.textContent ?? "",
    );
    expect(summaryTexts.join(" ")).not.toContain("**");
  });
});
