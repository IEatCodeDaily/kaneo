import { describe, expect, it } from "vitest";
import {
  appendDescriptionRevision,
  type DescriptionRevision,
  sealDescriptionHistory,
} from "../../../apps/api/src/task/utils/description-history";

const WINDOW = 5 * 60_000;
const base = new Date("2026-07-30T10:00:00.000Z").getTime();
const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();

const revision = (
  overrides: Partial<DescriptionRevision> = {},
): DescriptionRevision => ({
  content: "first",
  editedAt: at(0),
  userId: "user-1",
  ...overrides,
});

describe("appendDescriptionRevision", () => {
  it("stores the first revision", () => {
    expect(appendDescriptionRevision([], revision(), WINDOW)).toHaveLength(1);
  });

  it("compresses rapid edits by the same author into one revision", () => {
    const history = appendDescriptionRevision([], revision(), WINDOW);

    const compressed = appendDescriptionRevision(
      history,
      revision({ content: "second", editedAt: at(60_000) }),
      WINDOW,
    );

    expect(compressed).toHaveLength(1);
    // The older snapshot is the further-back restore point, so it is kept.
    expect(compressed[0].content).toBe("first");
  });

  it("keeps a separate revision once the window has passed", () => {
    const history = appendDescriptionRevision([], revision(), WINDOW);

    const result = appendDescriptionRevision(
      history,
      revision({ content: "later", editedAt: at(WINDOW + 1) }),
      WINDOW,
    );

    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("later");
  });

  it("never compresses across different authors", () => {
    const history = appendDescriptionRevision([], revision(), WINDOW);

    const result = appendDescriptionRevision(
      history,
      revision({ content: "theirs", editedAt: at(1000), userId: "user-2" }),
      WINDOW,
    );

    expect(result).toHaveLength(2);
  });

  it("does not compress into a sealed revision even inside the window", () => {
    const sealed = sealDescriptionHistory(
      appendDescriptionRevision([], revision(), WINDOW),
      "user-1",
    );

    const result = appendDescriptionRevision(
      sealed,
      revision({ content: "after close", editedAt: at(1000) }),
      WINDOW,
    );

    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("after close");
  });
});

describe("sealDescriptionHistory", () => {
  it("seals the newest revision for the closing author", () => {
    const history = appendDescriptionRevision([], revision(), WINDOW);

    expect(sealDescriptionHistory(history, "user-1")[0].sealed).toBe(true);
  });

  it("leaves history untouched when another member closes the task", () => {
    const history = appendDescriptionRevision([], revision(), WINDOW);

    expect(sealDescriptionHistory(history, "user-2")).toEqual(history);
  });

  it("is a no-op on empty history", () => {
    expect(sealDescriptionHistory([], "user-1")).toEqual([]);
  });
});
