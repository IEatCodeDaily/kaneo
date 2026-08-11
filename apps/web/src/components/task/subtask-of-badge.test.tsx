import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubtaskOfBadge from "./subtask-of-badge";

const mocks = vi.hoisted(() => ({
  linkProps: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: (props: Record<string, unknown>) => {
    mocks.linkProps.push(props);
    return (
      // biome-ignore lint/a11y/useValidAnchor: test double for router Link
      <a data-testid="parent-link" href="#">
        {props.children as React.ReactNode}
      </a>
    );
  },
}));

const parent = {
  id: "parent-1",
  number: 12,
  title: "Parent task",
  status: "to-do",
};

describe("SubtaskOfBadge", () => {
  afterEach(() => {
    mocks.linkProps.length = 0;
    cleanup();
  });

  it("labels the parent with the board-prefixed task id", () => {
    render(
      <SubtaskOfBadge
        boardId="board-1"
        boardSlug="KAN"
        organizationId="org-1"
        parent={parent}
      />,
    );

    expect(
      screen.getByText("Subtask of", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("parent-link")).toHaveTextContent("KAN-12");
  });

  it("falls back to #number when the board slug is unknown", () => {
    render(
      <SubtaskOfBadge
        boardId="board-1"
        boardSlug={undefined}
        organizationId="org-1"
        parent={parent}
      />,
    );

    expect(screen.getByTestId("parent-link")).toHaveTextContent("#12");
  });

  it("links to the parent task route with board scope", () => {
    render(
      <SubtaskOfBadge
        boardId="board-1"
        boardSlug="KAN"
        organizationId="org-1"
        parent={parent}
      />,
    );

    // A board-scoped route is required; an organization-only path 404s.
    expect(mocks.linkProps[0].to).toBe(
      "/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId",
    );
    expect(mocks.linkProps[0].params).toEqual({
      organizationSlug: "org-1",
      boardSlug: "board-1",
      taskId: "parent-1",
    });
  });

  it("stops click propagation so opening the parent does not open the child", () => {
    render(
      <SubtaskOfBadge
        boardId="board-1"
        boardSlug="KAN"
        organizationId="org-1"
        parent={parent}
      />,
    );

    const stopPropagation = vi.fn();
    (
      mocks.linkProps[0].onClick as (event: {
        stopPropagation: () => void;
      }) => void
    )({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  });
});
