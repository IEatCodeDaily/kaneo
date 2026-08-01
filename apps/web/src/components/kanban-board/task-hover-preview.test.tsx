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
 * The visible behaviour is NOT unit-testable here. Base UI's preview card only
 * opens after a real pointer-hover sequence that jsdom does not produce, so the
 * dragging and non-dragging branches render byte-identical markup:
 *
 *   <div data-testid="card" data-slot="preview-card-trigger">card</div>
 *
 * A test asserting "no preview while dragging" therefore passes even with the
 * suppression removed — verified: deleting the guard left such a test green.
 * Rather than ship that false confidence, these cover the piece that IS
 * observable — the drag flag propagation the fix depends on — and the visible
 * outcome is proven in the browser instead (preview count 1 on hover, 0 while
 * dragging, 1 after drop; recorded on the ticket).
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
  });
});
