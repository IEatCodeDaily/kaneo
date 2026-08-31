import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTickets } from "./project-tickets";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./project-ticket-row", () => ({
  default: ({ ticket }: { ticket: { key: string; id: string } }) => (
    <div data-testid="project-ticket-row" data-key={ticket.key}>
      {ticket.id}
    </div>
  ),
  ProjectTicketRow: ({ ticket }: { ticket: { key: string; id: string } }) => (
    <div data-testid="project-ticket-row" data-key={ticket.key}>
      {ticket.id}
    </div>
  ),
}));

afterEach(() => cleanup());

const ticket = {
  id: "task-1",
  boardId: "board-1",
  boardSlug: "delivery",
  boardName: "Delivery",
  number: 1,
  key: "delivery-1",
  title: "Ship it",
  status: "to-do",
  priority: "high",
  archivedAt: null,
  startDate: null,
  dueDate: null,
  projectMilestoneId: null,
  rank: 0,
  addedAt: "2026-08-27T00:00:00.000Z",
  addedBy: "user-1",
};

describe("ProjectTickets", () => {
  it("renders canonical board keys and canonical Ticket routes for scoped tickets", () => {
    render(<ProjectTickets organizationSlug="acme" tickets={[ticket]} />);
    expect(screen.getByTestId("project-tickets-list")).toBeInTheDocument();
    expect(
      screen.getByTestId("project-ticket-row").getAttribute("data-key"),
    ).toBe("delivery-1");
  });

  it("groups board tickets by canonical status instead of rendering flat rows", () => {
    const statuses = [
      "to-do",
      "in-progress",
      "in-review",
      "done",
      "triage",
      "planned",
      "canceled",
      "duplicate",
    ];
    render(
      <ProjectTickets
        organizationSlug="acme"
        tickets={[
          ...statuses.map((status, index) => ({
            ...ticket,
            id: `task-${index}`,
            key: `delivery-${index}`,
            status,
          })),
          {
            ...ticket,
            id: "task-custom",
            key: "delivery-custom",
            status: "custom",
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "projects:tickets.views.board" }),
    );
    const columns = statuses.map((status) =>
      screen.getByTestId(`project-ticket-board-${status}`),
    );
    expect(columns.map((column) => column.getAttribute("data-testid"))).toEqual(
      statuses.map((status) => `project-ticket-board-${status}`),
    );
    expect(screen.getByTestId("project-ticket-board-other")).toHaveTextContent(
      "task-custom",
    );
    for (const column of columns)
      expect(column).not.toHaveTextContent("task-custom");
  });

  it("partitions timeline tickets into dated and unscheduled groups", () => {
    render(
      <ProjectTickets
        organizationSlug="acme"
        tickets={[
          {
            ...ticket,
            startDate: "2026-08-01T00:00:00.000Z",
            dueDate: "2026-08-03T00:00:00.000Z",
          },
          { ...ticket, id: "task-2", key: "delivery-2" },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "projects:tickets.views.timeline" }),
    );
    expect(
      screen.getByTestId("project-ticket-timeline-dated"),
    ).toHaveTextContent("task-1");
    expect(
      screen.getByTestId("project-ticket-timeline-unscheduled"),
    ).toHaveTextContent("task-2");
    expect(
      screen.getByTestId("project-ticket-timeline-bounds"),
    ).toHaveTextContent("2026-08-01");
    expect(screen.getByTestId("project-ticket-timeline-dated")).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByTestId("project-ticket-timeline-scale")).toHaveClass(
      "min-w-[42rem]",
    );
    expect(
      screen.getByTestId("project-ticket-timeline-rail-task-1"),
    ).toBeVisible();
    expect(
      screen.getByTestId("project-ticket-timeline-bar-task-1"),
    ).toHaveStyle({
      width: "100%",
    });
    expect(
      screen.queryByRole("button", { name: /save|move|resize/i }),
    ).toBeNull();
  });

  it("falls back to single-endpoint bars for start-only and due-only tickets", () => {
    render(
      <ProjectTickets
        organizationSlug="acme"
        tickets={[
          {
            ...ticket,
            id: "start-only",
            key: "delivery-s",
            startDate: "2026-08-01T00:00:00.000Z",
            dueDate: null,
          },
          {
            ...ticket,
            id: "due-only",
            key: "delivery-d",
            startDate: null,
            dueDate: "2026-08-05T00:00:00.000Z",
          },
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "projects:tickets.views.timeline" }),
    );
    expect(
      screen.getByTestId("project-ticket-timeline-rail-start-only"),
    ).toBeVisible();
    expect(
      screen.getByTestId("project-ticket-timeline-bar-start-only"),
    ).toHaveStyle({ left: "0%", width: "2%" });
    expect(
      screen.getByTestId("project-ticket-timeline-rail-due-only"),
    ).toBeVisible();
    expect(
      screen.getByTestId("project-ticket-timeline-bar-due-only"),
    ).toHaveStyle({ left: "100%", width: "2%" });
    expect(
      screen.getByTestId("project-ticket-timeline-bounds"),
    ).toHaveTextContent("2026-08-01 – 2026-08-05");
  });

  it("rehydrates all preferences for each project", () => {
    const { rerender } = render(
      <ProjectTickets
        organizationSlug="acme"
        projectId="one"
        tickets={[ticket]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "projects:tickets.views.board" }),
    );
    fireEvent.change(
      screen.getByLabelText("projects:tickets.filters.priority"),
      { target: { value: "high" } },
    );
    rerender(
      <ProjectTickets
        organizationSlug="acme"
        projectId="two"
        tickets={[ticket]}
      />,
    );
    expect(screen.getByTestId("project-tickets-list")).toBeInTheDocument();
    rerender(
      <ProjectTickets
        organizationSlug="acme"
        projectId="one"
        tickets={[ticket]}
      />,
    );
    expect(screen.getByTestId("project-tickets-board")).toBeInTheDocument();
    expect(
      screen.getByLabelText("projects:tickets.filters.priority"),
    ).toHaveValue("high");
  });

  it("renders the empty state when there are no scoped tickets", () => {
    render(<ProjectTickets organizationSlug="acme" tickets={[]} />);
    expect(screen.getByTestId("project-tickets-empty")).toBeInTheDocument();
  });
});
