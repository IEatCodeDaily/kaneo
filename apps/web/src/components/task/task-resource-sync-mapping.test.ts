import { describe, expect, it } from "vitest";
import { repoLinkSyncResourceType } from "./task-resource-links";

/**
 * #75: repo-linked issues must carry the same `[Synced]` badge as auto-linked
 * ones.
 *
 * `resource-sync-badge.test.tsx` proved the badge component works and still
 * passed while the badge was invisible in the app: the Resources list renders
 * two different row types, and only the `externalLinks` row called the badge.
 * Manually linked rows come from `repo-links`, whose shape uses
 * `itemType: "issues" | "pull-requests"` rather than `resourceType`.
 *
 * This pins the mapping between those two vocabularies, which is where the gap
 * actually was.
 */
describe("#75 repoLinkSyncResourceType", () => {
  it("maps a linked issue to the synced-issue resource type", () => {
    expect(repoLinkSyncResourceType("issues")).toBe("issue");
  });

  // NEGATIVE CONTROL: pull requests are integration context, not synced issue
  // state, and must never be labelled Synced.
  it("does not map pull requests to the synced-issue type", () => {
    expect(repoLinkSyncResourceType("pull-requests")).toBe("pull_request");
  });
});
