import { describe, expect, it } from "vitest";
import { shouldIncludeTaskLabel } from "../../../apps/api/src/task/controllers/get-tasks";

describe("board task repo label visibility", () => {
  it("hides repo labels unless the task is issue-synced", () => {
    expect(shouldIncludeTaskLabel("repo", false, false)).toBe(false);
    expect(shouldIncludeTaskLabel("repo", true, false)).toBe(true);
    expect(shouldIncludeTaskLabel("repo", false, true)).toBe(true);
    expect(shouldIncludeTaskLabel("kaneo", false, false)).toBe(true);
  });
});
