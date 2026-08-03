import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MilestonesView from "./milestones-view";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

const milestones = [
  {
    id: "m1",
    name: "Launch",
    dueDate: "2026-09-12T00:00:00.000Z",
    status: "active",
  },
  { id: "m2", name: "Follow-up", dueDate: null, status: "planned" },
] as never;
const tasks = [
  {
    id: "t1",
    title: "Ship UI",
    number: 57,
    milestoneId: "m1",
    status: "done",
    startDate: null,
    dueDate: null,
  },
  {
    id: "t2",
    title: "Write docs",
    number: 58,
    milestoneId: "m1",
    status: "to-do",
    startDate: null,
    dueDate: null,
  },
];

function renderView() {
  return render(
    <MilestonesView
      milestones={milestones}
      tasks={tasks}
      organizationId="o1"
      boardId="b1"
    />,
  );
}

describe("MilestonesView (#57)", () => {
  it("renders an accessible table with due date, inferred progress, status, and related tasks", () => {
    renderView();
    expect(
      screen.getByRole("table", { name: "tasks:milestone.view.caption" }),
    ).toBeTruthy();
    expect(screen.getByText("Launch")).toBeTruthy();
    expect(screen.getByText("Sep 12, 2026")).toBeTruthy();
    expect(screen.getByText("50% (1/2)")).toBeTruthy();
    expect(screen.getByText("tasks:milestone.status.active")).toBeTruthy();
    expect(screen.getByRole("button", { name: /#57Ship UI/ })).toBeTruthy();
  });

  it("navigates to the selected task in the milestone route", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /#57Ship UI/ }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/organization/$organizationId/board/$boardId/milestones",
      params: { organizationId: "o1", boardId: "b1" },
      search: { taskId: "t1" },
    });
  });

  it("shows explicit fallbacks for milestones without dates or tasks", () => {
    renderView();
    expect(screen.getByText("tasks:milestone.view.noDueDate")).toBeTruthy();
    expect(screen.getByText("tasks:milestone.view.noTasks")).toBeTruthy();
  });
});
