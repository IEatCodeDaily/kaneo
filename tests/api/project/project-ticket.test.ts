import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { projectTicketTable } from "../../../apps/api/src/database/schema";

describe("project ticket membership", () => {
  it("exports the explicit project_ticket table with immutable association fields", () => {
    expect(projectTicketTable).toBeDefined();
    expect(projectTicketTable.projectId).toBeDefined();
    expect(projectTicketTable.taskId).toBeDefined();
    expect(projectTicketTable.rank).toBeDefined();
    expect(projectTicketTable.addedBy).toBeDefined();
    expect(projectTicketTable.addedAt).toBeDefined();
  });

  it("pins the unique task_id constraint (zero-or-one Project per ticket)", () => {
    const config = getTableConfig(projectTicketTable);
    const taskIdUnique = config.uniqueConstraints.some(
      (constraint) =>
        constraint.name === "project_ticket_task_unique" &&
        constraint.columns.length === 1 &&
        constraint.columns[0]?.name === "task_id",
    );
    expect(taskIdUnique).toBe(true);
  });
});
