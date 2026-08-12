import { describe, expect, it } from "vitest";
import {
  formatGitHubCommentBody,
  selectGitHubCommentAuthor,
} from "../../../apps/api/src/repo/controllers/github-comment-author-policy";

describe("selectGitHubCommentAuthor", () => {
  it("keeps a delegated grant authoritative and refuses silent app fallback", () => {
    expect(selectGitHubCommentAuthor(true)).toEqual({
      author: "github-user",
      mayFallbackToApp: false,
    });
  });

  it("uses the app when no delegated grant exists", () => {
    expect(selectGitHubCommentAuthor(false)).toEqual({
      author: "github-app",
      mayFallbackToApp: true,
    });
  });
});

describe("formatGitHubCommentBody", () => {
  it("appends the attribution as a single trailing quoted line", () => {
    expect(formatGitHubCommentBody("Hello there", "Ada")).toBe(
      "Hello there\n\n> Ada (sent from kaneo)",
    );
  });

  it("never quotes the body, so rich markdown survives", () => {
    const rich = [
      "# Heading",
      "",
      "![shot](https://example.com/a.png)",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "- item one",
      "- item two",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n");

    const result = formatGitHubCommentBody(rich, "Ada");

    // The body must appear untouched — no line gained a "> " prefix.
    expect(result.startsWith(rich)).toBe(true);
    expect(result).toContain("![shot](https://example.com/a.png)");
    expect(result).toContain("```ts");
    expect(result).toContain("| a | b |");

    // Exactly one quoted line, and it is the trailing attribution.
    const quoted = result.split("\n").filter((line) => line.startsWith("> "));
    expect(quoted).toEqual(["> Ada (sent from kaneo)"]);
  });

  it("attributes delegated (human-authored) comments too", () => {
    // Regression: the delegated path previously emitted the body with no
    // attribution at all, relying on GitHub's easy-to-miss "with <App>" badge.
    const result = formatGitHubCommentBody("ship it", "Raisal Wardana");
    expect(result.endsWith("> Raisal Wardana (sent from kaneo)")).toBe(true);
  });

  it("falls back to a generic name when the user has none", () => {
    expect(formatGitHubCommentBody("hi", null)).toBe(
      "hi\n\n> A Kaneo user (sent from kaneo)",
    );
    expect(formatGitHubCommentBody("hi", "   ")).toBe(
      "hi\n\n> A Kaneo user (sent from kaneo)",
    );
  });

  it("does not leave a blank gap between body and attribution", () => {
    expect(formatGitHubCommentBody("hi\n\n\n", "Ada")).toBe(
      "hi\n\n> Ada (sent from kaneo)",
    );
  });
});
