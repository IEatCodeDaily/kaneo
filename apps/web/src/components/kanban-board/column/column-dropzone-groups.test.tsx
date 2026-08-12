import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #61 rework: with board grouping on, each group must be its own collapsible
 * section the user can show/hide. Asserts aria-expanded AND that the group's
 * task rows actually leave the DOM — an aria-only assertion would still pass
 * if the toggle stopped hiding anything.
 */

afterEach(cleanup);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  verticalListSortingStrategy: {},
}));

vi.mock("../task-card", () => ({
  default: ({ task }: { task: { title: string } }) => (
    <div data-testid="task-card">{task.title}</div>
  ),
}));

const groupByMock = vi.fn(() => "priority");
vi.mock("../board-view-context", () => ({
  useBoardGroupBy: () => groupByMock(),
}));

import { ColumnDropzone } from "./column-dropzone";

type Task = {
  id: string;
  title: string;
  priority: string;
  labels?: unknown[];
  dueDate?: string | null;
};

function makeColumn() {
  const tasks: Task[] = [
    { id: "t1", title: "High one", priority: "high" },
    { id: "t2", title: "Low one", priority: "low" },
  ];
  return {
    id: "col-1",
    name: "In Progress",
    tasks,
  } as never;
}

describe("ColumnDropzone grouped sections", () => {
  it("renders one collapsible section per group, expanded by default", () => {
    render(<ColumnDropzone column={makeColumn()} />);

    const toggles = screen.getAllByRole("button", { expanded: true });
    expect(toggles.length).toBe(2);
    expect(screen.getByText("High one")).toBeTruthy();
    expect(screen.getByText("Low one")).toBeTruthy();
  });

  it("hides only that group's tasks when its header is clicked", () => {
    render(<ColumnDropzone column={makeColumn()} />);

    const highToggle = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("high"));
    if (!highToggle) throw new Error("no group toggle for high priority");

    fireEvent.click(highToggle);

    expect(highToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("High one")).toBeNull();
    // Sibling group is untouched.
    expect(screen.getByText("Low one")).toBeTruthy();
  });

  it("shows the group again on a second click", () => {
    render(<ColumnDropzone column={makeColumn()} />);

    const toggle = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("high"));
    if (!toggle) throw new Error("no group toggle for high priority");

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("High one")).toBeTruthy();
  });

  it("groups by due date and renders a calendar icon", () => {
    groupByMock.mockReturnValue("dueDate");
    const column = makeColumn();
    column.tasks[0].dueDate = "2026-08-07T12:00:00.000Z";
    column.tasks[1].dueDate = null;

    render(<ColumnDropzone column={column as never} />);

    expect(screen.getByText(/Aug 7, 2026/)).toBeTruthy();
    expect(screen.getByText("tasks:groupBy.noDueDate")).toBeTruthy();
    expect(document.querySelectorAll("svg.lucide-calendar-days").length).toBe(
      2,
    );
  });

  it("renders every label bucket when one task has several labels", () => {
    groupByMock.mockReturnValue("label");
    const column = makeColumn();
    column.tasks = [
      {
        id: "t1",
        title: "Shared task",
        priority: "high",
        labels: [{ name: "frontend" }, { name: "bug" }],
      },
    ];

    render(<ColumnDropzone column={column as never} />);

    expect(screen.getByText("frontend")).toBeTruthy();
    expect(screen.getByText("bug")).toBeTruthy();
    expect(screen.getAllByText("Shared task")).toHaveLength(2);
  });
});
