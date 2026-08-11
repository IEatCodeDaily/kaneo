import { describe, expect, it } from "vitest";
import {
  KANBAN_VIRTUALIZATION_THRESHOLD,
  shouldVirtualizeKanbanColumn,
} from "./kanban-virtualization";

describe("kanban column virtualization", () => {
  it("virtualizes large ungrouped columns", () => {
    expect(
      shouldVirtualizeKanbanColumn({
        groupBy: "none",
        itemCount: KANBAN_VIRTUALIZATION_THRESHOLD + 1,
      }),
    ).toBe(true);
  });

  it("keeps small columns fully mounted", () => {
    expect(
      shouldVirtualizeKanbanColumn({
        groupBy: "none",
        itemCount: KANBAN_VIRTUALIZATION_THRESHOLD,
      }),
    ).toBe(false);
  });

  it("does not virtualize grouped sections until they have a dedicated model", () => {
    expect(
      shouldVirtualizeKanbanColumn({
        groupBy: "assignee",
        itemCount: 1_500,
      }),
    ).toBe(false);
  });
});
