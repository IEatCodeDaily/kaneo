import { describe, expect, it } from "vitest";
import {
  type FlatRow,
  getDragDepth,
  getProjection,
  getSubtreeIds,
  INDENTATION_WIDTH_PX,
  NEST_INTENT_THRESHOLD,
  wouldCreateCycle,
} from "./task-nesting-projection";

/** `A B C D` all at top level. */
const flat: FlatRow[] = [
  { id: "A", depth: 0, parentId: null },
  { id: "B", depth: 0, parentId: null },
  { id: "C", depth: 0, parentId: null },
  { id: "D", depth: 0, parentId: null },
];

/** `A`, with children `A1`/`A2`, then `B`. */
const nested: FlatRow[] = [
  { id: "A", depth: 0, parentId: null },
  { id: "A1", depth: 1, parentId: "A" },
  { id: "A2", depth: 1, parentId: "A" },
  { id: "B", depth: 0, parentId: null },
];

const I = INDENTATION_WIDTH_PX;

describe("getProjection — nesting by horizontal drag", () => {
  it("keeps a row at top level with no horizontal travel", () => {
    const projection = getProjection(flat, "C", "B", 0);
    expect(projection).toEqual({
      depth: 0,
      dragDepth: 0,
      maxDepth: 1,
      minDepth: 0,
      parentId: null,
    });
  });

  it("nests under the row above when dragged one indent to the right", () => {
    // This is the gesture the user asked for. Dropping C ON B means C takes B's
    // slot, so the row that ends up ABOVE C is A — and A becomes the parent.
    const projection = getProjection(flat, "C", "B", I);
    expect(projection?.depth).toBe(1);
    expect(projection?.parentId).toBe("A");
  });

  it("nests under the hovered row when dropped just below it", () => {
    // Dropping C on C's own slot keeps B above it, so B is the parent.
    const projection = getProjection(flat, "C", "C", I);
    expect(projection?.depth).toBe(1);
    expect(projection?.parentId).toBe("B");
  });

  it("treats a partial drag past the halfway point as a full indent", () => {
    // Math.round, so >= half an indent commits to nesting.
    expect(getProjection(flat, "C", "B", I * 0.6)?.depth).toBe(1);
    expect(getProjection(flat, "C", "B", I * 0.4)?.depth).toBe(0);
  });

  it("clamps to one level even when dragged far right", () => {
    const projection = getProjection(flat, "C", "B", I * 8);
    expect(projection?.depth).toBe(1);
    expect(projection?.parentId).toBe("A");
  });

  it("cannot nest the first row — it has nothing above it", () => {
    const projection = getProjection(flat, "A", "A", I * 4);
    expect(projection?.maxDepth).toBe(0);
    expect(projection?.depth).toBe(0);
    expect(projection?.parentId).toBeNull();
  });

  it("becomes a sibling when dropped at the same depth as an existing child", () => {
    // Drop B onto A2's slot with one indent: previous row is A1 (depth 1), so B
    // joins them under A rather than nesting under A1.
    const projection = getProjection(nested, "B", "A2", I);
    expect(projection?.depth).toBe(1);
    expect(projection?.parentId).toBe("A");
  });

  it("un-nests a child dragged back to the left", () => {
    // A2 starts at depth 1; dragging one indent left projects depth 0.
    const projection = getProjection(nested, "A2", "A2", -I);
    expect(projection?.depth).toBe(0);
    expect(projection?.parentId).toBeNull();
  });

  it("will not leave the row below deeper than its own parent", () => {
    // Dropping A above A1 cannot go shallower than A1's depth.
    const projection = getProjection(nested, "A", "A", -I * 3);
    expect(projection?.minDepth).toBe(1);
    expect(projection?.depth).toBe(1);
  });

  it("returns null for unknown ids", () => {
    expect(getProjection(flat, "nope", "B", 0)).toBeNull();
    expect(getProjection(flat, "A", "nope", 0)).toBeNull();
  });
});

describe("getSubtreeIds", () => {
  it("returns the row plus its contiguous deeper descendants", () => {
    expect(getSubtreeIds(nested, "A")).toEqual(["A", "A1", "A2"]);
  });

  it("returns just the row for a leaf", () => {
    expect(getSubtreeIds(nested, "A1")).toEqual(["A1"]);
    expect(getSubtreeIds(nested, "B")).toEqual(["B"]);
  });

  it("returns empty for an unknown id", () => {
    expect(getSubtreeIds(nested, "nope")).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects nesting a parent under its own child", () => {
    expect(wouldCreateCycle(nested, "A", "A1")).toBe(true);
  });

  it("rejects nesting a row under itself", () => {
    expect(wouldCreateCycle(nested, "A", "A")).toBe(true);
  });

  it("allows an unrelated parent", () => {
    expect(wouldCreateCycle(nested, "B", "A")).toBe(false);
  });

  it("allows un-nesting to top level", () => {
    expect(wouldCreateCycle(nested, "A1", null)).toBe(false);
  });
});

describe("intent box (drag depth hysteresis)", () => {
  const W = INDENTATION_WIDTH_PX;
  const settle = (offsets: number[], start = 0) =>
    offsets.reduce((prev, px) => getDragDepth(px, W, prev), start);

  it("holds the current level inside the dead zone", () => {
    // Anything short of the threshold must NOT change level.
    for (const px of [0, 1, 5, W * NEST_INTENT_THRESHOLD - 0.01]) {
      expect(getDragDepth(px, W, 0)).toBe(0);
    }
  });

  it("nests only after the pointer leaves the box to the right", () => {
    expect(getDragDepth(W * NEST_INTENT_THRESHOLD - 0.01, W, 0)).toBe(0);
    expect(getDragDepth(W * NEST_INTENT_THRESHOLD, W, 0)).toBe(1);
  });

  it("does NOT oscillate when the hand wobbles on the boundary", () => {
    // THE JANK TEST. Naive Math.round flips at exactly W/2, so a 1px tremor
    // there toggles depth on every mousemove. Replay a realistic wobble and
    // assert the level is completely stable.
    const boundary = W / 2;
    const wobble: number[] = [];
    for (let i = 0; i < 40; i++)
      wobble.push(boundary + (i % 2 === 0 ? 0.5 : -0.5));
    const levels = new Set<number>();
    let prev = 0;
    for (const px of wobble) {
      prev = getDragDepth(px, W, prev);
      levels.add(prev);
    }
    expect([...levels]).toEqual([0]);
  });

  it("is asymmetric: returning needs travel back past the inner edge", () => {
    // Cross out to level 1...
    const atOne = getDragDepth(W, W, 0);
    expect(atOne).toBe(1);
    // ...sitting just inside level 1's box keeps it at 1 (a plain round would
    // have dropped back to 0 below W/2).
    expect(getDragDepth(W * 0.5, W, atOne)).toBe(1);
    // Only clearly heading back collapses it. (Stay off the exact boundary:
    // W*(1-0.6) lands on 9.600000000000001 and is a float knife-edge.)
    expect(getDragDepth(W * 0.3, W, atOne)).toBe(0);
  });

  it("still reaches deep levels on a long deliberate drag", () => {
    expect(settle([W, W * 2, W * 3])).toBe(3);
    expect(getDragDepth(W * 3, W, 0)).toBe(3);
  });

  it("un-nests on a leftward drag", () => {
    expect(getDragDepth(-W, W, 0)).toBe(-1);
    expect(getDragDepth(-W * 2, W, 0)).toBe(-2);
  });

  it("is monotonic: pushing further right never reduces the level", () => {
    let prev = 0;
    let last = getDragDepth(0, W, prev);
    for (let px = 0; px <= W * 4; px += 2) {
      prev = getDragDepth(px, W, prev);
      expect(prev).toBeGreaterThanOrEqual(last);
      last = prev;
    }
  });

  it("never hangs or overshoots on an absurd jump", () => {
    expect(getDragDepth(W * 1000, W, 0)).toBeLessThanOrEqual(16);
    expect(getDragDepth(0, 0, 2)).toBe(2);
  });

  it("getProjection threads the intent box and reports dragDepth", () => {
    const stable = getProjection(flat, "C", "C", W / 2, W, 3, 0);
    expect(stable?.dragDepth).toBe(0);
    expect(stable?.depth).toBe(0);
    const nested = getProjection(flat, "C", "C", W, W, 3, 0);
    expect(nested?.dragDepth).toBe(1);
    expect(nested?.depth).toBe(1);
    // Carrying dragDepth=1 keeps the row nested inside the dead zone.
    const held = getProjection(flat, "C", "C", W / 2, W, 3, 1);
    expect(held?.dragDepth).toBe(1);
    expect(held?.depth).toBe(1);
  });
});
