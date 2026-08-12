import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LinkTicketCandidateRow from "./link-ticket-candidate-row";

const candidate = {
  id: "t1",
  title: "Wire the flux capacitor",
  number: 42,
  boardId: "b1",
  boardName: "Backend",
  boardSlug: "be",
  status: "in-progress",
  statusName: "In Progress",
  statusIcon: null,
  statusIsFinal: false,
};

describe("LinkTicketCandidateRow", () => {
  afterEach(cleanup);

  it("renders the column status ICON, not a text badge", () => {
    render(<LinkTicketCandidateRow task={candidate} />);

    // The icon wrapper carries the human name as its accessible label/tooltip.
    const icon = screen.getByTestId("link-ticket-status-icon-t1");
    expect(icon).toBeTruthy();
    expect(icon.querySelector("svg")).toBeTruthy();
    expect(icon.getAttribute("title")).toBe("In Progress");

    // The rejected text badge must be gone.
    expect(screen.queryByTestId("link-ticket-status-t1")).toBeNull();
    expect(screen.queryByText("In Progress")).toBeNull();
  });

  it("renders the done icon for final columns", () => {
    render(
      <LinkTicketCandidateRow
        task={{
          ...candidate,
          id: "t2",
          status: "done",
          statusName: "Done",
          statusIsFinal: true,
        }}
      />,
    );
    const icon = screen.getByTestId("link-ticket-status-icon-t2");
    expect(icon.querySelector('[data-testid="column-done-icon"]')).toBeTruthy();
  });

  it("shows the board-scoped ticket key and title", () => {
    render(<LinkTicketCandidateRow task={candidate} />);
    expect(screen.getByText("be-42")).toBeTruthy();
    expect(screen.getByText("Wire the flux capacitor")).toBeTruthy();
  });
});
