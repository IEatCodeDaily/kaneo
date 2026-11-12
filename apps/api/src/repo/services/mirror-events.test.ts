import { describe, expect, it } from "vitest";
import { shouldMirrorEvent } from "./mirror-events";

describe("mirror event filter", () => {
  it("mirrors events that can change issues/PRs", () => {
    for (const event of [
      "issues",
      "pull_request",
      "push",
      "label",
      "issue_comment",
    ]) {
      expect(shouldMirrorEvent(event)).toBe(true);
    }
  });

  it("skips CI-storm events that cannot change issues/PRs", () => {
    for (const event of [
      "workflow_job",
      "workflow_run",
      "workflow_dispatch",
      "status",
      "check_run",
      "pull_request_review",
      "pull_request_review_comment",
      "ping",
      "star",
    ]) {
      expect(shouldMirrorEvent(event)).toBe(false);
    }
  });
});
