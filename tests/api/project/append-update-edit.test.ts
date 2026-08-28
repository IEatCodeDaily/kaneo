import { describe, expect, it, vi } from "vitest";
import {
  appendUpdateEdit,
  type UpdateEdit,
} from "../../../apps/api/src/project/utils/append-update-edit";

describe("appendUpdateEdit", () => {
  it("appends a pre-edit snapshot with the current timestamp and author", () => {
    const before = new Date("2026-08-26T10:00:00.000Z");
    vi.setSystemTime(before);

    const result = appendUpdateEdit([], "original content", "user-1");

    expect(result).toEqual([
      {
        content: "original content",
        editedAt: "2026-08-26T10:00:00.000Z",
        userId: "user-1",
      },
    ]);
  });

  it("keeps every prior revision — no compression window", () => {
    const history: UpdateEdit[] = [
      {
        content: "original",
        editedAt: "2026-08-26T09:00:00.000Z",
        userId: "user-1",
      },
      { content: "v1", editedAt: "2026-08-26T09:01:30.000Z", userId: "user-1" },
    ];

    const result = appendUpdateEdit(history, "v2", "user-1");

    // Two edits seconds apart by the same author still yield three entries.
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ content: "original" });
    expect(result[1]).toMatchObject({ content: "v1" });
    expect(result[2]).toMatchObject({ content: "v2" });
  });

  it("does not mutate the input array (append-only)", () => {
    const history: UpdateEdit[] = [
      {
        content: "original",
        editedAt: "2026-08-26T09:00:00.000Z",
        userId: "user-1",
      },
    ];
    const snapshot = [...history];

    const result = appendUpdateEdit(history, "v1", "user-1");

    expect(history).toEqual(snapshot);
    expect(result).not.toBe(history);
    expect(result.slice(0, history.length)).toEqual(history);
  });
});
