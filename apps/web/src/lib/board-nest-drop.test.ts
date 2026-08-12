import { describe, expect, it } from "vitest";
import type { BoardWithTasks } from "@/types/board";
import {
  boardToNestRows,
  hasNestModifier,
  planNestDrop,
} from "./board-nest-drop";

/**
 * Drag-to-nest on board/list reuses the timeline's planner. These bind to the
 * shipped helpers so the reuse is proven, not asserted in a comment.
 *
 * The gesture is Ctrl/Cmd + drop, NOT horizontal travel: a vertical list gives
 * no reliable x-axis signal (snapCenterToCursor re-centres the overlay and
 * verticalListSortingStrategy only reports vertical neighbours), and a
 * "drag slightly right" gesture is undiscoverable.
 */

const task = (id: string) => ({ id, title: id, status: "to-do" }) as never;

const board = ({ depthLimit }: { depthLimit?: number } = {}): BoardWithTasks =>
  ({
    id: "b1",
    subtaskDepthLimit: depthLimit,
    columns: [
      { id: "to-do", tasks: [task("a"), task("b"), task("c")] },
      { id: "done", tasks: [task("d")] },
    ],
  }) as unknown as BoardWithTasks;

const rel = (parent: string, child: string, id = `${parent}->${child}`) => ({
  id,
  sourceTaskId: parent,
  targetTaskId: child,
  relationType: "subtask",
});

describe("hasNestModifier", () => {
  it("is true for Ctrl (Windows/Linux)", () => {
    expect(hasNestModifier({ ctrlKey: true, metaKey: false })).toBe(true);
  });

  it("is true for Cmd (macOS)", () => {
    expect(hasNestModifier({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it("is false with no modifier", () => {
    expect(hasNestModifier({ ctrlKey: false, metaKey: false })).toBe(false);
  });

  it("is false for a missing event", () => {
    expect(hasNestModifier(null)).toBe(false);
  });
});

describe("boardToNestRows", () => {
  it("derives parent and depth from the relation list", () => {
    const rows = boardToNestRows({
      board: board(),
      relations: [rel("a", "b"), rel("b", "c")],
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    expect(byId.a).toMatchObject({ parentId: null, depth: 0 });
    expect(byId.b).toMatchObject({ parentId: "a", depth: 1 });
    expect(byId.c).toMatchObject({ parentId: "b", depth: 2 });
    expect(byId.d).toMatchObject({ parentId: null, depth: 0 });
  });

  it("does not hang on a cyclic relation list", () => {
    const rows = boardToNestRows({
      board: board(),
      relations: [rel("a", "b"), rel("b", "a")],
    });
    expect(rows).toHaveLength(4);
  });
});

describe("planNestDrop", () => {
  it("makes the literal hovered ticket the parent with the nest modifier", () => {
    // No inferred previous-row/indent zone: Ctrl+drop `c` ON `b` means `b` is
    // the parent. This is the user-visible contract and the preview names `b`.
    const plan = planNestDrop({
      board: board(),
      relations: [],
      activeId: "c",
      overId: "b",
      nestIntent: true,
    });

    expect(plan).not.toBeNull();
    expect(plan?.parentId).toBe("b");
    expect(plan?.createRelation).toMatchObject({
      sourceTaskId: "b",
      targetTaskId: "c",
      relationType: "subtask",
    });
  });

  it("can use the first ticket as the literal parent", () => {
    const plan = planNestDrop({
      board: board(),
      relations: [],
      activeId: "b",
      overId: "a",
      nestIntent: true,
    });

    expect(plan?.parentId).toBe("a");
    expect(plan?.createRelation).toMatchObject({
      sourceTaskId: "a",
      targetTaskId: "b",
    });
  });

  it("can use the final ticket as the literal parent without persisting a sentinel", () => {
    const plan = planNestDrop({
      board: board(),
      relations: [],
      activeId: "a",
      overId: "c",
      nestIntent: true,
    });

    expect(plan?.parentId).toBe("c");
    expect(plan?.createRelation).toMatchObject({
      sourceTaskId: "c",
      targetTaskId: "a",
    });
    expect(plan?.orderedIds.some((id) => id.startsWith("__nest_after__"))).toBe(
      false,
    );
  });

  it("does NOT nest without the modifier (plain reorder)", () => {
    // THE REGRESSION GUARD for the gesture change: the same drop that nests
    // with Ctrl must be an ordinary reorder without it, otherwise every drag
    // would silently re-parent tickets.
    const plan = planNestDrop({
      board: board(),
      relations: [],
      activeId: "c",
      overId: "b",
      nestIntent: false,
    });

    expect(plan?.parentId).toBeNull();
    expect(plan?.createRelation).toBeNull();
  });

  it("unnests when dropped without the modifier onto a top-level slot", () => {
    const plan = planNestDrop({
      board: board(),
      relations: [rel("a", "b", "REL-1")],
      activeId: "b",
      overId: "a",
      nestIntent: false,
      previousDragDepth: 1,
    });

    expect(plan?.parentId).toBeNull();
    expect(plan?.deleteRelationId).toBe("REL-1");
    expect(plan?.createRelation).toBeNull();
  });

  it("refuses to nest a task under its own descendant", () => {
    const plan = planNestDrop({
      board: board(),
      relations: [rel("a", "b")],
      activeId: "a",
      overId: "b",
      nestIntent: true,
    });

    // Either rejected outright, or resolved to a parent outside the subtree —
    // never a cycle.
    expect(plan?.parentId).not.toBe("b");
  });

  it("honours the board's subtask depth limit", () => {
    const shallow = planNestDrop({
      board: board({ depthLimit: 1 }),
      relations: [rel("a", "b")],
      activeId: "c",
      overId: "b",
      nestIntent: true,
    });

    // b is already at depth 1; nesting under it would exceed the limit of 1.
    // Null feeds the UI's explicit "Cannot nest here" preview and prevents the
    // drop from silently degrading into a reorder.
    expect(shallow).toBeNull();
  });
});
