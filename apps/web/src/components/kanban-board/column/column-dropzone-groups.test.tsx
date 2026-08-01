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
  useBoardDragging: () => false,
  useBoardGroupBy: () => groupByMock(),
}));

import { ColumnDropzone } from "./column-dropzone";

type Task = {
  id: string;
  title: string;
  priority: string;
  labels?: unknown[];
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
});
