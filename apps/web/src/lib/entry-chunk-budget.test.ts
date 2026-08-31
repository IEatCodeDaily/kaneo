import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-86: keep the rich-text editor OUT of the entry chunk.
 *
 * The editor stack (TipTap + ProseMirror, ~760KB of source) is only needed when
 * someone actually opens an editor: ticket description, comments, repo
 * description. It was landing in the entry chunk because create-task-modal
 * imports TaskDescriptionEditor statically, and that modal is mounted from the
 * board, list, backlog and search surfaces — so every route, including login,
 * paid for it.
 *
 * This asserts the SHIPPED ARTIFACT rather than the import graph: it reads the
 * real entry chunk that index.html loads and fails if ProseMirror's view layer
 * is inside it. Asserting the built output is the only way to catch a lazy
 * boundary that a bundler silently re-merges.
 */

const distDir = join(__dirname, "../../dist");

function entryChunkPath(): string | null {
  const indexHtml = join(distDir, "index.html");
  if (!existsSync(indexHtml)) return null;

  const html = readFileSync(indexHtml, "utf8");
  const match = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  if (!match) return null;

  const file = join(distDir, "assets", match[1] as string);
  return existsSync(file) ? file : null;
}

describe("KFL-86 entry chunk budget", () => {
  it("does not ship the ProseMirror editor in the entry chunk", () => {
    const entry = entryChunkPath();
    if (!entry) {
      // No build present (unit-test-only run) — nothing to assert against.
      return;
    }

    const source = readFileSync(entry, "utf8");

    /*
      A marker string unique to prosemirror-view's runtime. Chosen over a
      package path because paths do not survive minification, whereas this
      error text is emitted verbatim in the shipped bundle.
    */
    const PROSEMIRROR_VIEW_MARKER =
      "Adding different instances of a keyed plugin";

    expect(source.includes(PROSEMIRROR_VIEW_MARKER)).toBe(false);
  });

  it("keeps the entry chunk under a 1.2MB budget", () => {
    const entry = entryChunkPath();
    if (!entry) return;

    const bytes = readFileSync(entry).byteLength;
    const megabytes = bytes / 1024 / 1024;

    /*
      Measured baseline before this work: 1.83MB. The editor split is worth
      ~0.6MB, so 1.2MB is a budget the current code must actually meet rather
      than an aspiration. Raise it deliberately, never to make a red test green.
    */
    expect(megabytes).toBeLessThan(1.2);
  });
});
