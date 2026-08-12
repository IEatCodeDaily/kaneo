import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type Task from "@/types/task";
import TaskAssigneeAvatar from "./task-assignee-avatar";

/**
 * A ticket is assigned to a USER or a TEAM (mutually exclusive columns).
 * Card, list row and backlog row each branched on `task.userId` alone, so a
 * team-assigned ticket rendered the "?" unassigned glyph on every board
 * surface. These bind to the shipped component all three now render.
 */

afterEach(cleanup);

const base = {
  id: "t1",
  title: "Ticket",
  number: 1,
  boardId: "b1",
  status: "to-do",
} as unknown as Task;

const task = (over: Partial<Task>) => ({ ...base, ...over }) as Task;

describe("TaskAssigneeAvatar", () => {
  it("renders the team glyph for a team-assigned ticket", () => {
    render(
      <TaskAssigneeAvatar
        task={task({
          userId: null,
          teamId: "team-1",
          teamAssigneeName: "Platform",
        } as Partial<Task>)}
      />,
    );

    // The bug: this asserted-absent node is what used to render.
    expect(screen.queryByTestId("task-assignee-unassigned")).toBeNull();
    expect(screen.getByTestId("task-assignee-team")).toBeInTheDocument();
    expect(screen.getByTitle("Platform")).toBeInTheDocument();
  });

  it("renders the user avatar for a user-assigned ticket", () => {
    render(
      <TaskAssigneeAvatar
        task={task({
          userId: "u1",
          assigneeName: "Ada Lovelace",
        } as Partial<Task>)}
      />,
    );

    expect(screen.getByTestId("task-assignee-user")).toBeInTheDocument();
    expect(screen.queryByTestId("task-assignee-unassigned")).toBeNull();
  });

  it("renders the unassigned glyph only when neither user nor team is set", () => {
    render(
      <TaskAssigneeAvatar
        task={task({ userId: null, teamId: null } as Partial<Task>)}
      />,
    );

    expect(screen.getByTestId("task-assignee-unassigned")).toBeInTheDocument();
    expect(screen.queryByTestId("task-assignee-team")).toBeNull();
    expect(screen.queryByTestId("task-assignee-user")).toBeNull();
  });
});
