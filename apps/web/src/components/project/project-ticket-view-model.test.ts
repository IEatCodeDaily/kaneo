import { describe, expect, it } from "vitest";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";
import {
  defaultProjectTicketFilters,
  filterAndSortProjectTickets,
  milestoneGroups,
} from "./project-ticket-view-model";

const ticket = (patch: Partial<ProjectTicket>): ProjectTicket => ({
  id: "a",
  boardId: "b",
  boardSlug: "board",
  boardName: "Board",
  number: 1,
  key: "board-1",
  title: "Alpha",
  status: "to-do",
  priority: null,
  archivedAt: null,
  startDate: null,
  dueDate: null,
  projectMilestoneId: null,
  rank: 1,
  addedAt: "2026-01-01",
  addedBy: "u",
  ...patch,
});
describe("Project ticket view model", () => {
  it("filters search and schedule and keeps rank ties deterministic", () => {
    const rows = filterAndSortProjectTickets(
      [
        ticket({ id: "z", title: "Zulu", dueDate: "2026-02-01" }),
        ticket({ id: "a", title: "Alpha" }),
      ],
      {
        ...defaultProjectTicketFilters,
        search: "board",
        schedule: "scheduled",
      },
    );
    expect(rows.map((row) => row.id)).toEqual(["z"]);
  });
  it("groups only by project milestone identity", () => {
    const rows = milestoneGroups([
      ticket({ id: "a", projectMilestoneId: "pm-1" }),
      ticket({ id: "b", projectMilestoneId: null }),
    ]);
    expect(Object.keys(rows)).toEqual(["unassigned", "pm-1"]);
    expect(rows["pm-1"].map((row) => row.id)).toEqual(["a"]);
  });
});
