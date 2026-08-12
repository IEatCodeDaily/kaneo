import { describe, expect, it } from "vitest";
import {
  groupTicketCandidatesByBoard,
  type TicketCandidate,
} from "./link-ticket-candidates";

const candidate = (
  overrides: Partial<TicketCandidate> = {},
): TicketCandidate => ({
  id: "t1",
  title: "A ticket",
  number: 12,
  boardId: "b1",
  boardName: "Backend",
  boardSlug: "be",
  status: "to-do",
  statusName: "To Do",
  ...overrides,
});

describe("groupTicketCandidatesByBoard", () => {
  it("groups candidates into one section per board, preserving board order", () => {
    const groups = groupTicketCandidatesByBoard([
      candidate({ id: "t1", boardId: "b1", boardName: "Backend" }),
      candidate({ id: "t2", boardId: "b2", boardName: "Frontend" }),
      candidate({ id: "t3", boardId: "b1", boardName: "Backend" }),
    ]);

    expect(groups.map((group) => group.boardName)).toEqual([
      "Backend",
      "Frontend",
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["t1", "t3"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["t2"]);
  });

  it("keeps the human status name on every candidate for badge rendering", () => {
    const groups = groupTicketCandidatesByBoard([
      candidate({ status: "in-progress", statusName: "In Progress" }),
    ]);
    expect(groups[0].items[0].statusName).toBe("In Progress");
    expect(groups[0].items[0].status).toBe("in-progress");
  });

  it("omits boards with no candidates", () => {
    expect(groupTicketCandidatesByBoard([])).toEqual([]);
  });
});
