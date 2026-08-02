import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseGetMyTasks = vi.fn();
const mockUseGetMyFlags = vi.fn();

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

vi.mock("@/hooks/queries/flag/use-get-my-flags", () => ({
  default: () => mockUseGetMyFlags(),
}));

import MyTasksCountBadge from "@/components/my-tasks-count-badge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withTasks(rows: { id: string }[] | undefined) {
  mockUseGetMyTasks.mockReturnValue({ data: rows });
}

function withFlags(
  rows: { taskId: string; resolvedAt?: string | null }[] = [],
) {
  mockUseGetMyFlags.mockReturnValue({ data: rows });
}

describe("MyTasksCountBadge", () => {
  it("renders the number of assigned tickets", () => {
    withTasks([{ id: "a" }, { id: "b" }, { id: "c" }]);
    withFlags();

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("3");
  });

  it("renders nothing when there is nothing to do (no zero badge)", () => {
    withTasks([]);
    withFlags();

    const { container } = render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.queryByTestId("my-tasks-count-badge")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while the tickets are still loading", () => {
    withTasks(undefined);
    withFlags();

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.queryByTestId("my-tasks-count-badge")).toBeNull();
  });

  it("caps the displayed count at 99+", () => {
    withTasks(
      Array.from({ length: 120 }, (_, index) => ({ id: String(index) })),
    );
    withFlags();

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("99+");
  });

  /**
   * KFL-141 is explicit: "for inbox, show all. for tickets, show flagged and
   * assigned tickets number." So this must ask for ASSIGNED, not `all`.
   */
  it("counts assigned tickets, not every related ticket", () => {
    withTasks([{ id: "a" }]);
    withFlags();

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(mockUseGetMyTasks).toHaveBeenCalledWith({
      organizationId: "org-1",
      relation: "assigned",
      includeCompleted: false,
    });
  });

  it("includes tickets flagged for me that are not assigned to me", () => {
    withTasks([{ id: "a" }]);
    withFlags([{ taskId: "flagged-1", resolvedAt: null }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("2");
  });

  // A ticket both assigned to me AND flagged for me is one piece of work.
  it("counts an assigned-and-flagged ticket only once", () => {
    withTasks([{ id: "a" }, { id: "b" }]);
    withFlags([{ taskId: "a", resolvedAt: null }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("2");
  });

  it("ignores resolved flags", () => {
    withTasks([{ id: "a" }]);
    withFlags([{ taskId: "done-1", resolvedAt: "2026-08-01T00:00:00.000Z" }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("1");
  });

  it("uses the same badge styling as the Inbox badge", () => {
    withTasks([{ id: "a" }]);
    withFlags();

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
