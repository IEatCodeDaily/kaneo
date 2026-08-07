import { describe, expect, it } from "vitest";
import { isRepoSyncedTask } from "./task-repo-label-visibility";

describe("isRepoSyncedTask", () => {
  it("accepts only issue sync, not plain or pull-request links", () => {
    expect(isRepoSyncedTask([{ resourceType: "issue" }] as never, [])).toBe(
      true,
    );
    expect(
      isRepoSyncedTask([], [
        { itemType: "issues", syncEnabled: true },
      ] as never),
    ).toBe(true);
    expect(
      isRepoSyncedTask([], [
        { itemType: "pull-requests", syncEnabled: true },
        { itemType: "issues", syncEnabled: false },
      ] as never),
    ).toBe(false);
  });
});
