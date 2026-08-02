import { describe, expect, it } from "vitest";
import { shouldMirrorIssueComment } from "../../../apps/api/src/plugins/github/webhooks/issue-comment-created";

const payload = (action: string, login = "alice") =>
  ({
    action,
    issue: { number: 2 },
    comment: {
      id: 1,
      body: "hello",
      html_url: "https://github.test/comment/1",
      user: { login, avatar_url: "" },
      created_at: "2026-01-01T00:00:00Z",
    },
    repository: { owner: { login: "owner" }, name: "repo" },
  }) as const;

describe("GitHub issue comment sync (#2)", () => {
  it("mirrors creates and edits but not bots or unrelated actions", () => {
    expect(shouldMirrorIssueComment(payload("created"))).toBe(true);
    expect(shouldMirrorIssueComment(payload("edited"))).toBe(true);
    expect(shouldMirrorIssueComment(payload("deleted"))).toBe(false);
    expect(shouldMirrorIssueComment(payload("created", "sync[bot]"))).toBe(
      false,
    );
  });
});
