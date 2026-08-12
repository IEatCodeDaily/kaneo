import { describe, expect, it } from "vitest";
import { planGanttTaskDrop } from "./gantt-task-rail-dnd";

const row = (id: string, depth = 0, parentId: string | null = null) => ({
  id,
  depth,
  parentId,
});

describe("Gantt task rail drop planning", () => {
  it("dragging right creates a subtask relation under the preceding row", () => {
    const plan = planGanttTaskDrop({
      rows: [row("parent"), row("task")],
      relations: [],
      activeId: "task",
      overId: "task",
      deltaX: 24,
    });
    expect(plan?.createRelation).toEqual({
      sourceTaskId: "parent",
      targetTaskId: "task",
      relationType: "subtask",
    });
  });

  it("dragging left deletes the old subtask relation", () => {
    const plan = planGanttTaskDrop({
      rows: [row("parent"), row("task", 1, "parent")],
      relations: [
        {
          id: "rel",
          sourceTaskId: "parent",
          targetTaskId: "task",
          relationType: "subtask",
        },
      ],
      activeId: "task",
      overId: "task",
      deltaX: -24,
    });
    expect(plan?.deleteRelationId).toBe("rel");
    expect(plan?.parentId).toBeNull();
    expect(plan?.createRelation).toBeNull();
  });

  it("blocks parenting a task under its descendant", () => {
    // NOTE: for a simple parent/child pair `removeChildrenOf` already drops the
    // child from the candidate list, so this returns null at the candidate check
    // and does NOT exercise `wouldCreateCycle`. Kept as a behavioural guarantee.
    expect(
      planGanttTaskDrop({
        rows: [row("parent"), row("child", 1, "parent")],
        relations: [],
        activeId: "parent",
        overId: "child",
        deltaX: 24,
      }),
    ).toBeNull();
  });

  it("never resolves a parent inside the dragged subtree", () => {
    // Sweeps every drop target and horizontal intent to assert the invariant:
    // the chosen parent is never the dragged row or one of its descendants.
    //
    // HONESTY NOTE: this invariant currently holds because `removeChildrenOf`
    // strips descendants from the candidate list, NOT because of the
    // `wouldCreateCycle` guard. A negative control deleting that guard leaves
    // this suite green — the guard is unreachable defence in depth today. This
    // test proves the observable behaviour, not the guard's necessity.
    const rows = [
      row("root"),
      row("branch", 1, "root"),
      row("leaf", 2, "branch"),
      row("sibling"),
    ];
    for (const deltaX of [-72, -48, -24, 0, 24, 48, 72, 240]) {
      for (const overId of ["root", "branch", "leaf", "sibling"]) {
        const plan = planGanttTaskDrop({
          rows,
          relations: [],
          activeId: "branch",
          overId,
          deltaX,
          maxNestDepth: 4,
        });
        if (!plan?.parentId) continue;
        expect(["branch", "leaf"]).not.toContain(plan.parentId);
        // The subtree must also survive intact, in order, exactly once.
        expect(plan.orderedIds.filter((id) => id === "branch")).toHaveLength(1);
        expect(plan.orderedIds.indexOf("leaf")).toBe(
          plan.orderedIds.indexOf("branch") + 1,
        );
      }
    }
  });

  it("moves a parent subtree as one contiguous block", () => {
    const plan = planGanttTaskDrop({
      rows: [
        row("parent"),
        row("child", 1, "parent"),
        row("middle"),
        row("last"),
      ],
      relations: [],
      activeId: "parent",
      overId: "last",
      deltaX: 0,
    });
    expect(plan?.orderedIds).toEqual(["middle", "last", "parent", "child"]);
  });

  it("uses the hovered row's original slot in both directions", () => {
    const rows = [row("a"), row("b"), row("c"), row("d")];
    expect(
      planGanttTaskDrop({
        rows,
        relations: [],
        activeId: "d",
        overId: "b",
        deltaX: 0,
      })?.orderedIds,
    ).toEqual(["a", "d", "b", "c"]);
    expect(
      planGanttTaskDrop({
        rows,
        relations: [],
        activeId: "a",
        overId: "c",
        deltaX: 0,
      })?.orderedIds,
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("honors the board's configured nesting depth", () => {
    // The API counts TASK LEVELS, so a board limit of 3 permits row depth 2.
    const deep = planGanttTaskDrop({
      rows: [row("root"), row("child", 1, "root"), row("task")],
      relations: [],
      activeId: "task",
      overId: "task",
      deltaX: 48,
      maxNestDepth: 3,
    });
    expect(deep?.depth).toBe(2);
    expect(deep?.parentId).toBe("child");

    // A limit of 1 means no nesting at all: depth stays 0 however far you drag.
    const flat = planGanttTaskDrop({
      rows: [row("root"), row("task")],
      relations: [],
      activeId: "task",
      overId: "task",
      deltaX: 240,
      maxNestDepth: 1,
    });
    expect(flat?.depth).toBe(0);
    expect(flat?.parentId).toBeNull();
    expect(flat?.createRelation).toBeNull();
  });
});
