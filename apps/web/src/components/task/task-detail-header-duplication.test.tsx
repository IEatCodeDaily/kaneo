import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #258 regression: the task-detail header duplicated information.
 *
 * Two independent duplications were visible in the drawer at once:
 *  1. the milestone name — the picker trigger already prints it, and a
 *     read-only MilestoneBadge printed it again beside the picker;
 *  2. the task identifier (e.g. "KTEST-3") — the drawer topbar renders it, and
 *     TaskDetailsContent rendered it a second time above the title.
 *
 * These tests mount the REAL host chain (TaskDetailsSheet -> TaskTopbarControls
 * -> TaskTopbarMilestone, and TaskDetailsSheet -> TaskDetailsContent) so a
 * duplicate reintroduced at ANY of those levels fails here. Only leaf children
 * irrelevant to the header are stubbed.
 */

const MILESTONE = "Test Milestone 2";
const TASK_IDENT = "KTEST-3";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? key,
  }),
}));

// --- data layer: one task, on one board, with one milestone assigned ---
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({
    data: {
      id: "task-1",
      boardId: "board-1",
      number: 3,
      title: "[Suite] Parent epic test",
      description: "",
      milestoneId: "ms-2",
    },
  }),
}));
vi.mock("@/hooks/queries/board/use-get-board", () => ({
  default: () => ({ data: { slug: "KTEST", name: "Kaneo Test" } }),
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones-by-board", () => ({
  default: () => ({
    data: [
      { id: "ms-1", name: "Test Milestone 1", status: "active" },
      { id: "ms-2", name: MILESTONE, status: "active" },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/mutations/milestone/use-assign-milestone-to-task", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/mutations/label/use-create-label", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/queries/label/use-get-labels-by-organization", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/activity/use-get-activities-by-task-id", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/task-relation/use-get-task-relations", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  default: () => ({ user: { id: "u1" } }),
}));

// --- leaf children with no bearing on header identity ---
vi.mock("./task-title", () => ({
  default: () => <div data-testid="task-title">[Suite] Parent epic test</div>,
}));
vi.mock("./task-description", () => ({ default: () => null }));
vi.mock("./task-description-history", () => ({ default: () => null }));
vi.mock("./task-subtasks", () => ({ default: () => null }));
vi.mock("./task-relations", () => ({ default: () => null }));
vi.mock("./task-resources", () => ({ default: () => null }));
vi.mock("./task-properties-sidebar", () => ({ default: () => null }));
vi.mock("./task-template-menu", () => ({ default: () => null }));
vi.mock("./task-synced-issue-property", () => ({ default: () => null }));
vi.mock("@/components/flag/task-flag-section", () => ({ default: () => null }));
vi.mock("@/components/activity", () => ({ default: () => null }));
vi.mock("@/components/activity/comment-input", () => ({ default: () => null }));
vi.mock("@/components/presence/board-access-avatars", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import TaskDetailsSheet from "./task-details-sheet";

function renderDrawer() {
  return render(
    <TaskDetailsSheet
      taskId="task-1"
      boardId="board-1"
      organizationId="org-1"
      onClose={vi.fn()}
    />,
  );
}

/** Count DOM elements whose OWN text (no element children) equals `text`. */
function countLeafOccurrences(root: HTMLElement, text: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) => {
    if (el.querySelector("*")) return false;
    return (el.textContent ?? "").trim() === text;
  }).length;
}

afterEach(() => {
  // This suite asserts on *counts* of rendered text, so leaked DOM from a
  // previous render would look exactly like the duplication bug. Vitest is not
  // configured with globals/auto-cleanup here, so unmount explicitly.
  cleanup();
  vi.clearAllMocks();
});

describe("#258 task detail header shows each fact exactly once", () => {
  it("renders the assigned milestone name once, not once per widget", () => {
    const { container } = renderDrawer();

    expect(countLeafOccurrences(container, MILESTONE)).toBe(1);
  });

  it("keeps the milestone name on the interactive picker trigger", () => {
    renderDrawer();

    // The surviving copy must be the actionable one, so the user can still
    // change the milestone from the header.
    expect(screen.getByTestId("task-milestone-trigger").textContent).toContain(
      MILESTONE,
    );
  });

  it("does not render a read-only milestone badge beside the picker", () => {
    renderDrawer();

    expect(screen.queryByTestId("milestone-badge")).toBeNull();
  });

  it("renders the task identifier once across topbar and content", () => {
    const { container } = renderDrawer();

    expect(countLeafOccurrences(container, TASK_IDENT)).toBe(1);
  });
});
