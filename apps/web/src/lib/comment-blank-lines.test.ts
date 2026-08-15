import { describe, expect, it } from "vitest";
import { preserveParagraphSpacing } from "./comment-blank-lines";

describe("preserveParagraphSpacing", () => {
  it("keeps exactly one blank line between paragraphs (two consecutive \\n)", () => {
    expect(preserveParagraphSpacing("a\n\nb")).toBe("a\n\nb");
  });

  it("collapses 3+ newlines to one blank line", () => {
    expect(preserveParagraphSpacing("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("preserves the single trailing newline", () => {
    expect(preserveParagraphSpacing("a\n\nb\n")).toBe("a\n\nb\n");
  });

  it("does not touch blank lines inside fenced code blocks", () => {
    const input = "```\na\n\n\nb\n```";
    expect(preserveParagraphSpacing(input)).toBe(input);
  });

  it("round-trips: multiple blank lines in a row become one, not zero", () => {
    // The reported bug: extra spacing vanished entirely on save.
    expect(preserveParagraphSpacing("para one\n\n\n\npara two")).toBe(
      "para one\n\npara two",
    );
  });
});
