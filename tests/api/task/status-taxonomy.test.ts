import { describe, expect, it } from "vitest";
import {
  CLOSED_STATUS_TYPES,
  compareStatuses,
  DEFAULT_SLUG_BY_TYPE,
  DEFAULT_STATUSES,
  isClosedStatusType,
  isStatusType,
  pickStatusByType,
  STATUS_TYPE_BY_SLUG,
  STATUS_TYPES,
} from "../../../apps/api/src/task/status-taxonomy";

/**
 * CONTRACT TEST for the ticket status model.
 *
 * Slugs are stored in `task.status` on live rows, so seeded slugs are a
 * persistence contract: renaming or re-pointing one silently rewrites the
 * meaning of every row already saved with it.
 */

const FROZEN_SLUGS = [
  "to-do",
  "in-progress",
  "in-review",
  "done",
  "planned",
  "triage",
  "canceled",
  "duplicate",
] as const;

describe("status types (owner direction)", () => {
  it("are exactly the seven owner types, in display rank", () => {
    expect(STATUS_TYPES).toEqual([
      "triage",
      "backlog",
      "unstarted",
      "started",
      "completed",
      "canceled",
      "duplicate",
    ]);
  });

  it("close a ticket only for completed, canceled and duplicate", () => {
    expect(CLOSED_STATUS_TYPES).toEqual(["completed", "canceled", "duplicate"]);
    for (const type of STATUS_TYPES) {
      expect(isClosedStatusType(type)).toBe(
        (CLOSED_STATUS_TYPES as readonly string[]).includes(type),
      );
    }
    expect(isClosedStatusType(null)).toBe(false);
  });

  it("rejects anything that is not a type", () => {
    expect(isStatusType("none")).toBe(false);
    expect(isStatusType("archived")).toBe(false);
    expect(isStatusType(null)).toBe(false);
    expect(isStatusType("backlog")).toBe(true);
  });
});

describe("default statuses", () => {
  it("seed every frozen slug, once", () => {
    const slugs = DEFAULT_STATUSES.map((status) => status.slug);
    expect([...slugs].sort()).toEqual([...FROZEN_SLUGS].sort());
  });

  it("keep their labels (labels never change)", () => {
    const names = Object.fromEntries(
      DEFAULT_STATUSES.map((status) => [status.slug, status.name]),
    );
    expect(names).toEqual({
      triage: "Triage",
      planned: "Planned",
      "to-do": "To Do",
      "in-progress": "In Progress",
      "in-review": "In Review",
      done: "Done",
      canceled: "Canceled",
      duplicate: "Duplicate",
    });
  });

  it("cover every type, so by-type fallbacks always resolve", () => {
    const types = new Set(DEFAULT_STATUSES.map((status) => status.statusType));
    expect([...types].sort()).toEqual([...STATUS_TYPES].sort());
    for (const type of STATUS_TYPES) {
      expect(STATUS_TYPE_BY_SLUG[DEFAULT_SLUG_BY_TYPE[type]]).toBe(type);
    }
  });

  it("show backlog types and Duplicate off-board, the rest on the board", () => {
    const shown = DEFAULT_STATUSES.filter((s) => s.showOnBoard).map(
      (s) => s.slug,
    );
    expect(shown).toEqual([
      "to-do",
      "in-progress",
      "in-review",
      "done",
      "canceled",
    ]);
  });

  it("never treat archived as a status", () => {
    expect(DEFAULT_STATUSES.map((s) => s.slug)).not.toContain("archived");
  });
});

describe("ordering + by-type fallback", () => {
  const rows = [
    { slug: "done", statusType: "completed", position: 0 },
    { slug: "shipped", statusType: "completed", position: 1 },
    { slug: "to-do", statusType: "unstarted", position: 0 },
    { slug: "icebox", statusType: "backlog", position: 1 },
    { slug: "planned", statusType: "backlog", position: 0 },
  ];

  it("sorts by type rank, then position within the type", () => {
    expect([...rows].sort(compareStatuses).map((r) => r.slug)).toEqual([
      "planned",
      "icebox",
      "to-do",
      "done",
      "shipped",
    ]);
  });

  it("prefers the seeded slug, else the first status of the type", () => {
    expect(pickStatusByType(rows, "completed")?.slug).toBe("done");
    const withoutDone = rows.filter((r) => r.slug !== "done");
    expect(pickStatusByType(withoutDone, "completed")?.slug).toBe("shipped");
    expect(pickStatusByType(rows, "duplicate")).toBeUndefined();
  });
});
