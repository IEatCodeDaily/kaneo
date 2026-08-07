import { describe, expect, it } from "vitest";
import {
  collectSubtaskDescendants,
  resolvePropagationTargets,
} from "../../../apps/api/src/milestone/controllers/assign-milestone-to-task";

/** `sourceTaskId` is the PARENT, `targetTaskId` the subtask. */
const edge = (parent: string, child: string) => ({
  sourceTaskId: parent,
  targetTaskId: child,
});

describe("collectSubtaskDescendants", () => {
  it("returns nothing for a task with no children", () => {
    expect(collectSubtaskDescendants([], "solo")).toEqual([]);
  });

  it("finds a direct child", () => {
    expect(collectSubtaskDescendants([edge("p", "c")], "p")).toEqual(["c"]);
  });

  it("walks a 3-level chain to the grandchild", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(collectSubtaskDescendants(edges, "a")).toEqual(["b", "c"]);
  });

  it("collects every branch, not just the first", () => {
    const edges = [edge("root", "x"), edge("root", "y"), edge("x", "x1")];
    expect(collectSubtaskDescendants(edges, "root").sort()).toEqual([
      "x",
      "x1",
      "y",
    ]);
  });

  it("excludes the root itself", () => {
    expect(collectSubtaskDescendants([edge("p", "c")], "p")).not.toContain("p");
  });

  it("never walks upward to a parent", () => {
    // Starting at the child must not reach the parent.
    expect(collectSubtaskDescendants([edge("p", "c")], "c")).toEqual([]);
  });

  it("terminates on a direct cycle", () => {
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(collectSubtaskDescendants(edges, "a")).toEqual(["b"]);
  });

  it("terminates on a longer cycle", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a")];
    expect(collectSubtaskDescendants(edges, "a").sort()).toEqual(["b", "c"]);
  });

  it("does not repeat a node reachable by two paths", () => {
    const edges = [
      edge("a", "b"),
      edge("a", "c"),
      edge("b", "d"),
      edge("c", "d"),
    ];
    const found = collectSubtaskDescendants(edges, "a");
    expect(found.filter((id) => id === "d")).toHaveLength(1);
  });
});

describe("resolvePropagationTargets", () => {
  it("always includes the root first", () => {
    const targets = resolvePropagationTargets({
      edges: [],
      rootId: "root",
      boardId: "b1",
      boardIdOf: new Map(),
    });
    expect(targets).toEqual(["root"]);
  });

  it("includes same-board descendants", () => {
    const targets = resolvePropagationTargets({
      edges: [edge("root", "kid")],
      rootId: "root",
      boardId: "b1",
      boardIdOf: new Map([["kid", "b1"]]),
    });
    expect(targets).toEqual(["root", "kid"]);
  });

  it("EXCLUDES a descendant on another board", () => {
    // A milestone belongs to exactly one board, so a foreign subtask must not
    // receive it.
    const targets = resolvePropagationTargets({
      edges: [edge("root", "foreign")],
      rootId: "root",
      boardId: "b1",
      boardIdOf: new Map([["foreign", "b2"]]),
    });
    expect(targets).toEqual(["root"]);
  });

  it("excludes a descendant whose board is unknown", () => {
    const targets = resolvePropagationTargets({
      edges: [edge("root", "ghost")],
      rootId: "root",
      boardId: "b1",
      boardIdOf: new Map(),
    });
    expect(targets).toEqual(["root"]);
  });

  it("keeps deep same-board descendants", () => {
    const targets = resolvePropagationTargets({
      edges: [edge("a", "b"), edge("b", "c")],
      rootId: "a",
      boardId: "b1",
      boardIdOf: new Map([
        ["b", "b1"],
        ["c", "b1"],
      ]),
    });
    expect(targets).toEqual(["a", "b", "c"]);
  });

  it("keeps a same-board branch while dropping a foreign sibling", () => {
    const targets = resolvePropagationTargets({
      edges: [edge("a", "mine"), edge("a", "theirs")],
      rootId: "a",
      boardId: "b1",
      boardIdOf: new Map([
        ["mine", "b1"],
        ["theirs", "b2"],
      ]),
    });
    expect(targets).toEqual(["a", "mine"]);
  });

  it("never returns duplicates", () => {
    const targets = resolvePropagationTargets({
      edges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
      rootId: "a",
      boardId: "b1",
      boardIdOf: new Map([
        ["b", "b1"],
        ["c", "b1"],
        ["d", "b1"],
      ]),
    });
    expect(new Set(targets).size).toBe(targets.length);
  });
});
