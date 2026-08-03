import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const board = readFileSync(
  resolve(process.cwd(), "src/components/kanban-board/index.tsx"),
  "utf8",
);
const card = readFileSync(
  resolve(process.cwd(), "src/components/kanban-board/task-card.tsx"),
  "utf8",
);

describe("kanban drag hot path (#124)", () => {
  it("uses a lightweight overlay instead of mounting the interactive card tree", () => {
    expect(board).not.toContain("import { TaskCardContent }");
    expect(board).toContain("activeTask.title");
  });

  it("does not tween stale transforms on the active sortable card", () => {
    expect(card).toContain('transition: isDragging ? "none" : transition');
  });
});
