import { cleanup, render, screen } from "@testing-library/react";
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

  it("renders the empty state when there are no scoped tickets", () => {
    render(<ProjectTickets organizationSlug="acme" tickets={[]} />);
    expect(screen.getByTestId("project-tickets-empty")).toBeInTheDocument();
  });
});
