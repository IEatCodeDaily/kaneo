import { describe, expect, it } from "vitest";
import type { ExternalLink } from "@/types/external-link";
import {
  countSyncedIssueRemarks,
  selectResourceAutoLinks,
} from "./task-resource-links";

function externalLink(overrides: Partial<ExternalLink>): ExternalLink {
  return {
    id: "link-1",
    taskId: "task-1",
    provider: "github",
    resourceType: "issue",
    externalId: "42",
    url: "https://github.com/acme/widget/issues/42",
    title: "Fix the widget",
    metadata: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as ExternalLink;
}

describe("task Resources synced-issue consolidation (#75)", () => {
  it("keeps the synced issue in the Resources list", () => {
    const rows = selectResourceAutoLinks([externalLink({})], []);

    expect(rows.map((row) => row.resourceType)).toEqual(["issue"]);
  });

  it("renders the synced-issue remark exactly once", () => {
    expect(countSyncedIssueRemarks([externalLink({})])).toBe(1);
  });

  it("still drops a branch row once its pull request is present", () => {
    const rows = selectResourceAutoLinks(
      [
        externalLink({ id: "pr", resourceType: "pull_request" }),
        externalLink({ id: "br", resourceType: "branch" }),
      ],
      [],
    );

    expect(rows.map((row) => row.id)).toEqual(["pr"]);
  });
});
