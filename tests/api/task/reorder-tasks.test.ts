import { describe, expect, it } from "vitest";
import { taskStatusColumnIds } from "../../../apps/api/src/task/controllers/reorder-tasks";

describe("taskStatusColumnIds", () => {
  it("accepts board columns and virtual backlog statuses", () => {
    const statuses = taskStatusColumnIds([
      { id: "column-id", slug: "in-progress" },
    ]);

    expect(statuses.get("column-id")).toBe("column-id");
    expect(statuses.get("in-progress")).toBe("column-id");
    expect(statuses.has("planned")).toBe(true);
    expect(statuses.get("planned")).toBeNull();
    expect(statuses.has("archived")).toBe(true);
    expect(statuses.get("archived")).toBeNull();
  });
});
