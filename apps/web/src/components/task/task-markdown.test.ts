import { describe, expect, it } from "vitest";
import { formatTaskMarkdown } from "./task-markdown";

/**
 * #99: "extra line break go missing after I close the task detail drawer".
 *
 * Repro was: open task, add an extra blank line in the description, close the
 * drawer, reopen — the blank line is gone.
 *
 * The normalizer ran on BOTH the save path and the hydrate path, so a
 * deliberate blank line was collapsed on write and could never come back.
 * These cases pin what normalization is allowed to touch.
 */
describe("formatTaskMarkdown (#99)", () => {
  it("normalizes CRLF to LF", () => {
    expect(formatTaskMarkdown("a\r\nb")).toBe("a\nb");
  });

  it("preserves a single deliberate blank line between paragraphs", () => {
    // One blank line == "\n\n". This is the case the user lost.
    expect(formatTaskMarkdown("first\n\nsecond")).toBe("first\n\nsecond");
  });

  it("preserves two deliberate blank lines", () => {
    // Authors use extra spacing intentionally; collapsing it is data loss.
    expect(formatTaskMarkdown("first\n\n\nsecond")).toBe("first\n\n\nsecond");
  });

  it("preserves several blank lines rather than clamping to one", () => {
    expect(formatTaskMarkdown("a\n\n\n\n\nb")).toBe("a\n\n\n\n\nb");
  });

  it("still strips trailing whitespace-only tail so saves are idempotent", () => {
    // A trailing run of newlines is an artifact of the editor, not authored
    // content, and left alone it makes every re-hydrate look like a change.
    expect(formatTaskMarkdown("body\n\n\n")).toBe("body");
    expect(formatTaskMarkdown("body\n")).toBe("body");
  });

  it("is idempotent: formatting twice equals formatting once", () => {
    const samples = [
      "a\n\nb",
      "a\n\n\n\nb",
      "a\r\n\r\nb",
      "body\n\n\n",
      "",
      "one line",
    ];
    for (const sample of samples) {
      const once = formatTaskMarkdown(sample);
      expect(formatTaskMarkdown(once)).toBe(once);
    }
  });

  it("round-trips: what we save is what we hydrate", () => {
    // The actual bug: save(x) then hydrate(save(x)) must equal save(x), or the
    // content mutates every time the drawer is reopened.
    const authored = "para one\n\n\npara two after two blank lines";
    const saved = formatTaskMarkdown(authored);
    const hydrated = formatTaskMarkdown(saved);
    expect(hydrated).toBe(saved);
    expect(hydrated).toContain("\n\n\n");
  });

  it("handles empty and whitespace-only input", () => {
    expect(formatTaskMarkdown("")).toBe("");
    expect(formatTaskMarkdown("\n\n\n")).toBe("");
  });
});
