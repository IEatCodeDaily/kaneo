import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectRow } from "./project-row";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "Apr 5, 2026",
}));

afterEach(() => cleanup());

const project = {
  id: "project-1",
  slug: "growth",
  name: "Growth Initiative",
  summary: "Ship the growth loop",
  status: "started" as const,
  priority: "high",
  leadUserName: "Ada Lovelace",
  leadTeamName: null,
  startDate: null,
  targetDate: null,
  archivedAt: null,
  progress: null,
  health: null,
};

/**
 * KFL-366: ProjectRow exposes outcome metadata (name/summary/lifecycle/lead/
 * dates) but must NEVER render Board-Ticket execution ownership controls
 * (column assignment, status transitions, ticket assignee pickers) — this
 * ticket excludes ticket membership/progress entirely.
 */
describe("ProjectRow", () => {
  it("renders required outcome columns", () => {
    render(<ProjectRow onClick={() => {}} project={project} />);

    expect(screen.getByText("Growth Initiative")).toBeInTheDocument();
    expect(screen.getByText("Ship the growth loop")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("exposes no Board-Ticket execution ownership controls", () => {
    render(<ProjectRow onClick={() => {}} project={project} />);

    const row = screen.getByTestId("project-row");
    // No status-transition select, no column dropdown, no ticket-assignee
    // picker — Project rows are outcome metadata only.
    expect(row.querySelector("select")).toBeNull();
    expect(row.querySelector("[data-testid='column-select']")).toBeNull();
    expect(row.querySelector("[data-testid='assignee-picker']")).toBeNull();
  });

  it("invokes onClick when the row is activated", () => {
    const onClick = vi.fn();
    render(<ProjectRow onClick={onClick} project={project} />);

    screen.getByTestId("project-row").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
