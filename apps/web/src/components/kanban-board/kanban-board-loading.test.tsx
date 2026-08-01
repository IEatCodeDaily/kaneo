import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #111 follow-up: the board-shaped skeleton was only wired into the route and
 * BoardLayout. KanbanBoard kept its OWN inline placeholder — four bare boxes
 * with two grey bars each — which is exactly the "nothing has loaded" look the
 * ticket rejected. Whichever path renders first, the user must get the
 * board-shaped skeleton.
 */

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DragOverlay: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  closestCorners: vi.fn(),
  defaultDropAnimationSideEffects: vi.fn(),
  KeyboardSensor: vi.fn(),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// The loading branch returns before any of these render; stubbing them keeps
// the suite off the heavy Column/TaskCard/modal import chain.
vi.mock("./column", () => ({ default: () => <div /> }));
vi.mock("./task-card", () => ({ default: () => <div /> }));
vi.mock("../bulk-selection/bulk-toolbar", () => ({ default: () => <div /> }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useRegisterShortcuts: vi.fn(),
}));

vi.mock("@/store/board", () => ({
  default: () => ({ board: null, setBoard: vi.fn() }),
}));

vi.mock("@/store/bulk-selection", () => ({
  default: () => ({
    setAvailableTasks: vi.fn(),
    focusNext: vi.fn(),
    focusPrevious: vi.fn(),
    focusedTaskId: null,
    clearFocus: vi.fn(),
    selectedTaskIds: [],
    clearSelection: vi.fn(),
  }),
}));

import KanbanBoard from "@/components/kanban-board";

afterEach(cleanup);

describe("KanbanBoard loading state (#111)", () => {
  it("renders the shared board-shaped skeleton, not a flat placeholder", () => {
    render(
      <KanbanBoard
        board={undefined as unknown as never}
        disableDragDrop={false}
      />,
    );

    // The shared skeleton, identified by its own contract.
    const skeleton = screen.getByTestId("board-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("board-skeleton-column")).toHaveLength(4);

    // Card anatomy is what separates "your board, arriving" from a grey box.
    expect(screen.getAllByTestId("board-skeleton-card").length).toBeGreaterThan(
      4,
    );
    expect(screen.getAllByTestId("board-skeleton-column-name")).toHaveLength(4);
    expect(
      screen.getAllByTestId("board-skeleton-card-avatar").length,
    ).toBeGreaterThan(4);
  });

  it("leaves no second, card-less placeholder column behind", () => {
    render(
      <KanbanBoard
        board={undefined as unknown as never}
        disableDragDrop={false}
      />,
    );

    // The old inline placeholder rendered columns containing zero cards. If any
    // column has no cards, a flat placeholder is still being rendered.
    for (const column of screen.getAllByTestId("board-skeleton-column")) {
      expect(
        column.querySelectorAll('[data-testid="board-skeleton-card"]').length,
      ).toBeGreaterThan(0);
    }
  });
});
