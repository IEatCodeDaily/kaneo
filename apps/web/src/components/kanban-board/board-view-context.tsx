import { createContext, type ReactNode, useContext } from "react";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";

/**
 * Board view preferences that deeply-nested card renderers need without
 * threading props through every column/dropzone layer.
 *
 * Defaults to "none" so a board rendered outside the provider (tests, storybook,
 * embedded views) behaves exactly like an ungrouped board rather than crashing.
 */
const BoardGroupByContext = createContext<BoardGroupBy>("none");

export function BoardGroupByProvider({
  groupBy,
  children,
}: {
  groupBy: BoardGroupBy;
  children: ReactNode;
}) {
  return (
    <BoardGroupByContext.Provider value={groupBy}>
      {children}
    </BoardGroupByContext.Provider>
  );
}

export function useBoardGroupBy(): BoardGroupBy {
  return useContext(BoardGroupByContext);
}

/**
 * Whether a card is currently being dragged anywhere on this board (#131).
 *
 * Board-wide rather than per-card on purpose: a hover preview that is already
 * open when the drag begins belongs to the card under the pointer, and that
 * card's own `isDragging` does not necessarily flip (dnd-kit moves a clone in
 * a DragOverlay). Suppressing every preview while any drag is in flight is
 * what actually makes the popover vanish.
 *
 * Defaults to false so cards rendered outside the provider behave normally.
 */
const BoardDraggingContext = createContext(false);

export function BoardDraggingProvider({
  isDragging,
  children,
}: {
  isDragging: boolean;
  children: ReactNode;
}) {
  return (
    <BoardDraggingContext.Provider value={isDragging}>
      {children}
    </BoardDraggingContext.Provider>
  );
}

export function useBoardDragging(): boolean {
  return useContext(BoardDraggingContext);
}
