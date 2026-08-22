import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-86, fix 1: the sidebar's CreateTaskModal was statically imported by
 * search.tsx (part of the layout rendered on EVERY route), dragging the modal
 * and its dependency tree (~23 KB min) into the entry chunk even though the
 * modal is only needed after a click. Every other consumer lazy-imports this
 * exact module (list-view, backlog-list-view, kanban column-header). This
 * pins search.tsx to the same pattern.
 */

const source = readFileSync(
  resolve(__dirname, "../../../apps/web/src/components/search.tsx"),
  "utf8",
);

describe("search.tsx keeps CreateTaskModal out of the entry chunk", () => {
  it("does not statically import create-task-modal", () => {
    expect(source).not.toMatch(
      /import\s+\w+\s+from\s+"[^"]*create-task-modal"/,
    );
  });

  it("lazy-loads the modal like every other consumer", () => {
    expect(source).toMatch(/import\(\s*["'`][^"']*create-task-modal["'`]\s*\)/);
  });
});
