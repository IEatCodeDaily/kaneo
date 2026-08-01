import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseGetMyTasks = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && typeof options.count === "number"
        ? `${key}:${options.count}`
        : key,
  }),
}));

vi.mock("@/hooks/queries/task/use-get-my-tasks", () => ({
  default: (params?: unknown) => mockUseGetMyTasks(params),
}));

import MyTasksCountBadge from "@/components/my-tasks-count-badge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withTasks(rows: { id: string }[] | undefined) {
  mockUseGetMyTasks.mockReturnValue({ data: rows });
}

describe("MyTasksCountBadge", () => {
  it("renders the number of open tasks", () => {
    withTasks([{ id: "a" }, { id: "b" }, { id: "c" }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("3");
  });

  it("renders nothing when there are no open tasks (no zero badge)", () => {
    withTasks([]);

    const { container } = render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.queryByTestId("my-tasks-count-badge")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while the tasks are still loading", () => {
    withTasks(undefined);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.queryByTestId("my-tasks-count-badge")).toBeNull();
  });

  it("caps the displayed count at 99+", () => {
    withTasks(
      Array.from({ length: 120 }, (_, index) => ({ id: String(index) })),
    );

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("99+");
  });

  it("counts what the My Tasks page shows by default: relation all, no completed", () => {
    withTasks([{ id: "a" }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(mockUseGetMyTasks).toHaveBeenCalledWith({
      organizationId: "org-1",
      relation: "all",
      includeCompleted: false,
    });
  });

  it("uses the same badge styling as the Inbox badge", () => {
    withTasks([{ id: "a" }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    const badge = screen.getByTestId("my-tasks-count-badge");
    for (const token of [
      "ml-auto",
      "rounded-full",
      "bg-sidebar-primary",
      "text-sidebar-primary-foreground",
    ]) {
      expect(badge.classList.contains(token)).toBe(true);
    }
  });
});
