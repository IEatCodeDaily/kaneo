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

  it("gives the flagged badge a solid amber fill, distinct from assigned", () => {
    withTasks([{ id: "a" }]);
    withFlags([{ taskId: "f-1", resolvedAt: null }]);

    render(<MyTasksCountBadge organizationId="org-1" />);

    const flagged = screen.getByTestId("my-tasks-flagged-badge");
    const assigned = screen.getByTestId("my-tasks-count-badge");
    // Solid warning fill with a fixed dark label: the flagged pill must stay
    // readable on the dark sidebar AND on the white active nav pill (the old
    // transparent outline vanished the moment My Tickets was selected).
    expect(flagged.classList.contains("bg-warning")).toBe(true);
    expect(flagged.classList.contains("bg-transparent")).toBe(false);
    expect(flagged.classList.contains("text-[#1c1508]")).toBe(true);
    expect(assigned.classList.contains("bg-secondary")).toBe(true);
    for (const badge of [flagged, assigned]) {
      expect(badge.classList.contains("h-4")).toBe(true);
      expect(badge.classList.contains("min-w-6")).toBe(true);
      expect(badge.classList.contains("rounded-full")).toBe(true);
    }
    expect(flagged.parentElement?.classList.contains("gap-1")).toBe(true);
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
      // The badge mirrors the My Tickets page's default "All" tab.
      relation: "all",
      includeCompleted: false,
      // 100 + the "99+" render cap: the badge must never show the fetch
      // page size (50) as a total when the queue is longer.
      limit: 100,
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
      "bg-secondary",
      "text-secondary-foreground",
    ]) {
      expect(badge.classList.contains(token)).toBe(true);
    }
    // NavMain owns right alignment; this group only owns the inter-badge gap.
    expect(badge.parentElement?.classList.contains("shrink-0")).toBe(true);
  });
});
