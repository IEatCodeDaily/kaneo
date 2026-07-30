import { describe, expect, it } from "vitest";
import { selectBoardEdges } from "../../../apps/api/src/task-relation/controllers/get-board-task-relations";

const subtask = (id: string, parent: string, child: string) => ({
  id,
  sourceTaskId: parent,
  targetTaskId: child,
  relationType: "subtask",
});

describe("selectBoardEdges", () => {
  // The scenario from the spec: viewing BoardB.
  //   TaskA1 subtasks: TaskA2, TaskB1, TaskB2, TaskC1
  //   TaskB1 subtasks: TaskB3, TaskB4, TaskC2
  const localIds = new Set(["TaskB1", "TaskB2", "TaskB3", "TaskB4"]);
  const edges = [
    subtask("r1", "TaskA1", "TaskA2"),
    subtask("r2", "TaskA1", "TaskB1"),
    subtask("r3", "TaskA1", "TaskB2"),
    subtask("r4", "TaskA1", "TaskC1"),
    subtask("r5", "TaskB1", "TaskB3"),
    subtask("r6", "TaskB1", "TaskB4"),
    subtask("r7", "TaskB1", "TaskC2"),
  ];

  const kept = selectBoardEdges(edges, localIds);
  const keptIds = kept.map((edge) => edge.id);

  it("keeps the foreign parent's edges to local tasks", () => {
    expect(keptIds).toContain("r2"); // TaskA1 -> TaskB1
    expect(keptIds).toContain("r3"); // TaskA1 -> TaskB2
  });

  it("hides the foreign parent's children on other boards", () => {
    expect(keptIds).not.toContain("r1"); // TaskA1 -> TaskA2
    expect(keptIds).not.toContain("r4"); // TaskA1 -> TaskC1
  });

  it("keeps a local task's own subtasks, including cross-board ones", () => {
    expect(keptIds).toContain("r5"); // TaskB1 -> TaskB3
    expect(keptIds).toContain("r6"); // TaskB1 -> TaskB4
    expect(keptIds).toContain("r7"); // TaskB1 -> TaskC2 (cross-board child)
  });

  it("gives a local task at most one foreign parent", () => {
    const twoParents = selectBoardEdges(
      [subtask("p1", "TaskA1", "TaskB1"), subtask("p2", "TaskD1", "TaskB1")],
      localIds,
    );
    expect(twoParents.map((edge) => edge.id)).toEqual(["p1"]);
  });

  it("drops edges with no endpoint on this board", () => {
    expect(
      selectBoardEdges([subtask("x1", "TaskA1", "TaskC1")], localIds),
    ).toEqual([]);
  });
});
