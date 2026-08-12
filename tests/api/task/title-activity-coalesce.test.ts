import { describe, expect, it } from "vitest";
import {
  decideTitleActivity,
  readTitleChangeEventData,
  TITLE_ACTIVITY_COALESCE_WINDOW_MS,
} from "../../apps/api/src/task/title-activity-coalesce";

const now = new Date("2026-08-01T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const row = (
  over: Partial<
    Parameters<typeof decideTitleActivity>[0]["previous"] & object
  > = {},
) => ({
  id: "act-1",
  userId: "user-1",
  createdAt: ago(5_000),
  eventData: { oldTitle: "Original", newTitle: "Origina" },
  ...over,
});

describe("#108 title activity coalescing", () => {
  it("extends the previous entry for a rapid follow-up edit by the same user", () => {
    const decision = decideTitleActivity({
      previous: row(),
      currentUserId: "user-1",
      now,
    });
    expect(decision).toEqual({
      action: "update",
      activityId: "act-1",
      // The run's ORIGINAL title, not the value from a moment ago.
      oldTitle: "Original",
    });
  });

  it("keeps the earliest title across a whole typing run", () => {
    // Simulates the third keystroke-pause: the previous row already collapsed
    // "Original" -> "Origin", and the new edit must still report "Original".
    const decision = decideTitleActivity({
      previous: row({
        eventData: { oldTitle: "Original", newTitle: "Origin" },
      }),
      currentUserId: "user-1",
      now,
    });
    expect(decision).toMatchObject({ action: "update", oldTitle: "Original" });
  });

  // NEGATIVE CONTROL: outside the window must start a new entry, otherwise the
  // window arithmetic is dead code and every edit would merge forever.
  it("starts a new entry once the window has elapsed", () => {
    const decision = decideTitleActivity({
      previous: row({
        createdAt: ago(TITLE_ACTIVITY_COALESCE_WINDOW_MS + 1),
      }),
      currentUserId: "user-1",
      now,
    });
    expect(decision).toEqual({ action: "insert" });
  });

  it("merges right up to the window boundary", () => {
    const decision = decideTitleActivity({
      previous: row({ createdAt: ago(TITLE_ACTIVITY_COALESCE_WINDOW_MS) }),
      currentUserId: "user-1",
      now,
    });
    expect(decision.action).toBe("update");
  });

  // NEGATIVE CONTROL: never merge two people's renames into one audit row.
  it("never merges edits from a different user", () => {
    const decision = decideTitleActivity({
      previous: row({ userId: "user-2" }),
      currentUserId: "user-1",
      now,
    });
    expect(decision).toEqual({ action: "insert" });
  });

  it("starts a new entry when there is no previous title change", () => {
    expect(
      decideTitleActivity({ previous: null, currentUserId: "user-1", now }),
    ).toEqual({ action: "insert" });
  });

  it("starts a new entry rather than trusting a malformed previous row", () => {
    expect(
      decideTitleActivity({
        previous: row({ eventData: null }),
        currentUserId: "user-1",
        now,
      }),
    ).toEqual({ action: "insert" });
    expect(
      decideTitleActivity({
        previous: row({ eventData: { oldTitle: 42 } }),
        currentUserId: "user-1",
        now,
      }),
    ).toEqual({ action: "insert" });
  });

  // Clock skew must not merge into an entry that claims to be newer.
  it("does not merge when the previous entry is in the future", () => {
    expect(
      decideTitleActivity({
        previous: row({ createdAt: new Date(now.getTime() + 5_000) }),
        currentUserId: "user-1",
        now,
      }),
    ).toEqual({ action: "insert" });
  });

  it("honours a custom window", () => {
    expect(
      decideTitleActivity({
        previous: row({ createdAt: ago(5_000) }),
        currentUserId: "user-1",
        now,
        windowMs: 1_000,
      }),
    ).toEqual({ action: "insert" });
  });
});

describe("readTitleChangeEventData", () => {
  it("reads a well-formed payload", () => {
    expect(readTitleChangeEventData({ oldTitle: "a", newTitle: "b" })).toEqual({
      oldTitle: "a",
      newTitle: "b",
    });
  });

  it("treats a missing oldTitle as null rather than failing", () => {
    expect(readTitleChangeEventData({ newTitle: "b" })).toEqual({
      oldTitle: null,
      newTitle: "b",
    });
  });

  it("rejects non-object and non-string payloads", () => {
    expect(readTitleChangeEventData(null)).toBeNull();
    expect(readTitleChangeEventData("nope")).toBeNull();
    expect(readTitleChangeEventData({ oldTitle: {} })).toBeNull();
  });
});
