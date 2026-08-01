import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import { BoardDraggingProvider, useBoardDragging } from "./board-view-context";
import TaskHoverPreview from "./task-hover-preview";

/**
 * #131: "Hover tool tip should vanish when user is holding and dragging cards."
 *
 * SCOPE NOTE, deliberately narrow.
 *
 * Base UI hover itself needs a browser, but its trigger marker lets this test
 * prove the root unmounts during drag and remounts uncontrolled after drop.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(cleanup);

const task = {
  id: "task-1",
  number: 7,
  title: "Draggable card",
  status: "to-do",
  priority: "low",
  description: "",
  labels: [],
} as unknown as Task;

/** Mirrors how TaskCard reads the board-wide drag flag. */
function DragAwareCard() {
  const boardDragging = useBoardDragging();
  return (
    <TaskHoverPreview boardSlug="KFL" isDragging={boardDragging} task={task}>
      <div data-testid="card">
        <span data-testid="dragging-flag">{String(boardDragging)}</span>
      </div>
    </TaskHoverPreview>
  );
}

describe("#131 board-wide drag flag", () => {
  /**
   * Per-card `isDragging` was not enough live: the preview open when a drag
   * starts belongs to the hovered card, and dnd-kit drags a clone in a
   * DragOverlay, so that card's own flag need not flip. The board publishes
   * one "a drag is in flight" signal and every card honours it.
   */
  it("propagates the board's dragging state to cards", () => {
    render(
      <BoardDraggingProvider isDragging>
        <DragAwareCard />
      </BoardDraggingProvider>,
    );
    expect(screen.getByTestId("dragging-flag")).toHaveTextContent("true");
  });

  it("reports not-dragging while the board is idle", () => {
    render(
      <BoardDraggingProvider isDragging={false}>
        <DragAwareCard />
      </BoardDraggingProvider>,
    );
    expect(screen.getByTestId("dragging-flag")).toHaveTextContent("false");
  });

  // NEGATIVE CONTROL: the default must be false, so a card rendered outside a
  // board (list view, tests, storybook) keeps its normal hover preview.
  it("defaults to not-dragging outside any provider", () => {
    render(<DragAwareCard />);
    expect(screen.getByTestId("dragging-flag")).toHaveTextContent("false");
  });

  it("keeps rendering the card itself while dragging", () => {
    render(
      <BoardDraggingProvider isDragging>
        <DragAwareCard />
      </BoardDraggingProvider>,
    );
    // Only the preview is suppressed; the card stays draggable.
    expect(screen.getByTestId("card")).toBeInTheDocument();
    expect(screen.getByTestId("card")).not.toHaveAttribute(
      "data-slot",
      "preview-card-trigger",
    );
  });

  it("remounts a fresh hover preview after drop", () => {
    const { rerender } = render(
      <BoardDraggingProvider isDragging>
        <DragAwareCard />
      </BoardDraggingProvider>,
    );

    rerender(
      <BoardDraggingProvider isDragging={false}>
        <DragAwareCard />
      </BoardDraggingProvider>,
    );
    expect(screen.getByTestId("card")).toHaveAttribute(
      "data-slot",
      "preview-card-trigger",
    );
  });
});
