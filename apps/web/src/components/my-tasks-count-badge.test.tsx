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
  default: (organizationId?: string) => mockUseGetMyFlags(organizationId),
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
    // No flags -> no warning bubble at all, not a "0".
    expect(screen.queryByTestId("my-tasks-flagged-badge")).toBeNull();
  });

  /**
   * KFL-141, second round: "it's not flagged + assigned, it's flagged AND
   * assigned. so current white number should be assigned. flagged should be
   * different colour, like warning."
   *
   * 12 assigned + 2 flagged renders as TWO bubbles, 12 and 2 — not 14.
   */
  it("shows assigned and flagged as two separate counts", () => {
    withTasks(Array.from({ length: 12 }, (_, i) => ({ id: `t-${i}` })));
    withFlags([
      { taskId: "f-1", resolvedAt: null },
      { taskId: "f-2", resolvedAt: null },
    ]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("12");
    expect(screen.getByTestId("my-tasks-flagged-badge").textContent).toBe("2");
  });

  it("gives the flagged badge a warning colour, distinct from assigned", () => {
    withTasks([{ id: "a" }]);
    withFlags([{ taskId: "f-1", resolvedAt: null }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    const flagged = screen.getByTestId("my-tasks-flagged-badge");
    const assigned = screen.getByTestId("my-tasks-count-badge");
    expect(flagged.classList.contains("bg-warning")).toBe(true);
    expect(assigned.classList.contains("bg-sidebar-primary")).toBe(true);
    // The two bubbles must not share a background.
    expect(flagged.className).not.toBe(assigned.className);
  });

  it("shows only the flagged badge when nothing is assigned", () => {
    withTasks([]);
    withFlags([{ taskId: "f-1", resolvedAt: null }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.queryByTestId("my-tasks-count-badge")).toBeNull();
    expect(screen.getByTestId("my-tasks-flagged-badge").textContent).toBe("1");
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
    expect(mockUseGetMyFlags).toHaveBeenCalledWith("org-1");
  });

  it("ignores resolved flags", () => {
    withTasks([{ id: "a" }]);
    withFlags([{ taskId: "done-1", resolvedAt: "2026-08-01T00:00:00.000Z" }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    expect(screen.getByTestId("my-tasks-count-badge").textContent).toBe("1");
    expect(screen.queryByTestId("my-tasks-flagged-badge")).toBeNull();
  });

  it("uses the same badge styling as the Inbox badge", () => {
    withTasks([{ id: "a" }]);
    withFlags();

    render(<MyTasksCountBadge organizationId="org-1" />);

    const badge = screen.getByTestId("my-tasks-count-badge");
    for (const token of [
      "rounded-full",
      "bg-sidebar-primary",
      "text-sidebar-primary-foreground",
    ]) {
      expect(badge.classList.contains(token)).toBe(true);
    }
    // ml-auto now lives on the wrapper that holds both bubbles, so the group
    // as a whole still sits flush right in the nav row.
    expect(badge.parentElement?.classList.contains("ml-auto")).toBe(true);
  });
});
