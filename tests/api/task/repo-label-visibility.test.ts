import { describe, expect, it } from "vitest";
import { shouldIncludeTaskLabel } from "../../../apps/api/src/task/controllers/get-tasks";

describe("board task repo label visibility", () => {
  it("shows repo labels only on repo-synced boards", () => {
    expect(shouldIncludeTaskLabel("repo", false)).toBe(false);
    expect(shouldIncludeTaskLabel("repo", true)).toBe(true);
    expect(shouldIncludeTaskLabel("kaneo", false)).toBe(true);
  });
});
