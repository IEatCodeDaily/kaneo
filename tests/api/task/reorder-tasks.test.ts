import { describe, expect, it } from "vitest";
import { taskStatusColumnIds } from "../../../apps/api/src/task/controllers/reorder-tasks";

describe("taskStatusColumnIds", () => {
  it("maps every board status row by id and slug — nothing virtual", () => {
    const statuses = taskStatusColumnIds([
      { id: "column-id", slug: "in-progress" },
      { id: "planned-id", slug: "planned" },
    ]);

    expect(statuses.get("column-id")).toBe("column-id");
    expect(statuses.get("in-progress")).toBe("column-id");
    // Planned is a real row now, so it maps to its id, never to null.
    expect(statuses.get("planned")).toBe("planned-id");
    // A status the board does not have is not accepted.
    expect(statuses.has("triage")).toBe(false);
    // Archive is orthogonal state, not a workflow status.
    expect(statuses.has("archived")).toBe(false);
  });
});
