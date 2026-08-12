import { describe, expect, it } from "vitest";
import { relationDisplayType, relationPayload } from "./relation-direction";

describe("directional task relations", () => {
  it("stores Blocks as current -> selected", () => {
    expect(
      relationPayload({
        currentTaskId: "A",
        selectedTaskId: "B",
        intent: "blocks",
      }),
    ).toEqual({
      sourceTaskId: "A",
      targetTaskId: "B",
      relationType: "blocks",
    });
  });

  it("stores Blocked by as selected -> current", () => {
    expect(
      relationPayload({
        currentTaskId: "A",
        selectedTaskId: "B",
        intent: "blocked_by",
      }),
    ).toEqual({
      sourceTaskId: "B",
      targetTaskId: "A",
      relationType: "blocks",
    });
  });

  it("shows the reciprocal label on each endpoint", () => {
    expect(
      relationDisplayType({
        currentTaskId: "A",
        sourceTaskId: "A",
        relationType: "blocks",
      }),
    ).toBe("blocks");
    expect(
      relationDisplayType({
        currentTaskId: "B",
        sourceTaskId: "A",
        relationType: "blocks",
      }),
    ).toBe("blocked_by");
  });

  it("keeps related symmetric", () => {
    expect(
      relationPayload({
        currentTaskId: "A",
        selectedTaskId: "B",
        intent: "related",
      }).relationType,
    ).toBe("related");
    expect(
      relationDisplayType({
        currentTaskId: "B",
        sourceTaskId: "A",
        relationType: "related",
      }),
    ).toBe("related");
  });
});
