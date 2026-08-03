import { describe, expect, it } from "vitest";
import {
  clampSubtaskDepthLimit,
  countAncestors,
  countDescendantDepth,
  exceedsSubtaskDepthLimit,
  resultingChainDepth,
  type SubtaskEdge,
  subtaskDepthLimitMessage,
} from "../../../apps/api/src/task-relation/controllers/subtask-depth";

const edge = (sourceTaskId: string, targetTaskId: string): SubtaskEdge => ({
  sourceTaskId,
  targetTaskId,
});

describe("subtask depth limits (#95)", () => {
  it("defaults invalid values and clamps configured values to 1..4", () => {
    expect(clampSubtaskDepthLimit(undefined)).toBe(4);
    expect(clampSubtaskDepthLimit(Number.NaN)).toBe(4);
    expect(clampSubtaskDepthLimit(0)).toBe(1);
    expect(clampSubtaskDepthLimit(2.9)).toBe(2);
    expect(clampSubtaskDepthLimit(8)).toBe(4);
  });

  it("counts ancestors and deepest descendants in a nested tree", () => {
    const edges = [
      edge("root", "child"),
      edge("child", "grandchild"),
      edge("child", "sibling"),
    ];
    expect(countAncestors(edges, "grandchild")).toBe(2);
    expect(countDescendantDepth(edges, "root")).toBe(2);
    expect(countDescendantDepth(edges, "sibling")).toBe(0);
  });

  it("includes the target subtree when evaluating a new parent link", () => {
    const edges = [edge("target", "child"), edge("child", "grandchild")];
    expect(
      resultingChainDepth({
        edges,
        sourceTaskId: "new-root",
        targetTaskId: "target",
      }),
    ).toBe(4);
    expect(
      exceedsSubtaskDepthLimit({
        edges,
        sourceTaskId: "new-root",
        targetTaskId: "target",
        depthLimit: 3,
      }),
    ).toBe(true);
    expect(
      exceedsSubtaskDepthLimit({
        edges,
        sourceTaskId: "new-root",
        targetTaskId: "target",
        depthLimit: 4,
      }),
    ).toBe(false);
  });

  it("includes the source ancestry when reparenting below an existing chain", () => {
    const edges = [edge("root", "parent")];
    expect(
      resultingChainDepth({
        edges,
        sourceTaskId: "parent",
        targetTaskId: "leaf",
      }),
    ).toBe(3);
  });

  it("terminates on corrupt cycles instead of recursing forever", () => {
    const edges = [edge("a", "b"), edge("b", "a")];
    expect(countAncestors(edges, "a")).toBe(1);
    expect(countDescendantDepth(edges, "a")).toBe(1);
  });

  it("uses the configured limit in the rejection message", () => {
    expect(subtaskDepthLimitMessage(1)).toContain("at most 1 level");
    expect(subtaskDepthLimitMessage(4)).toContain("at most 4 levels");
  });
});
