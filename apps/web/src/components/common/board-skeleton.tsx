const skeletonColumns = [
  { key: "col-todo", cards: 3 },
  { key: "col-progress", cards: 4 },
  { key: "col-review", cards: 2 },
  { key: "col-done", cards: 1 },
];

/**
 * Kanban-shaped loading placeholder.
 *
 * Shared between the board route (initial load) and BoardLayout, which swaps it
 * in the moment a board switch is clicked — the outgoing route is still mounted
 * at that point, so without this the previous board's cards sit under the new
 * board's name for the whole render.
 */
export function BoardSkeleton() {
  return (
    <div className="flex h-full w-full gap-4 overflow-hidden p-4">
      {skeletonColumns.map((col) => (
        <div key={col.key} className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-5 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: col.cards }, (_, i) => `${col.key}-${i}`).map(
              (cardKey) => (
                <div
                  key={cardKey}
                  className="space-y-2.5 rounded-lg border border-border bg-card p-3"
                >
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
