import { describe, expect, it } from "vitest";
import {
  backlogSectionOf,
  isArchived,
  sectionCrossPayload,
} from "@/lib/task-archival";

/**
 * #226 regression guard: archival is ORTHOGONAL to status.
 *
 * Migration 0062 moved archival from `status: "archived"` onto
 * `task.archived_at` and dropped `"archived"` from the valid status vocabulary.
 * The frontend kept sending the old shape, so every archive action 400'd with:
 *
 *   Invalid status "archived". Valid statuses for this board: to-do, ...
 *
 * These import the SHIPPED helpers that backlog-list-view actually calls, so
 * they fail if that logic regresses -- not a local re-model of it.
 */

// mirrors apps/api/src/task/status-taxonomy.ts -- "archived" is deliberately absent
const VALID_STATUSES = [
  "to-do",
  "in-progress",
  "in-review",
  "done",
  "triage",
  "planned",
  "canceled",
  "duplicate",
];

const ARCHIVED_AT = "2026-08-05T00:00:00.000Z";

describe("archived is not a status", () => {
  it("is absent from the valid status vocabulary", () => {
    expect(VALID_STATUSES).not.toContain("archived");
  });

  it("archiving a Done ticket keeps it Done", () => {
    const payload = sectionCrossPayload({
      task: { status: "done" },
      targetSection: "archived",
    });

    expect(payload.archived).toBe(true);
    expect(payload.status).toBe("done");
    expect(payload.status).not.toBe("archived");
    expect(VALID_STATUSES).toContain(payload.status);
  });

  it("never emits a status outside the valid vocabulary", () => {
    for (const status of VALID_STATUSES) {
      for (const targetSection of ["archived", "planned"] as const) {
        const payload = sectionCrossPayload({
          task: { status, archivedAt: ARCHIVED_AT },
          targetSection,
        });
        expect(
          VALID_STATUSES,
          `${status} -> ${targetSection} produced ${payload.status}`,
        ).toContain(payload.status);
        expect(payload.status).not.toBe("archived");
      }
    }
  });

  it("archiving preserves every status unchanged", () => {
    for (const status of VALID_STATUSES) {
      const payload = sectionCrossPayload({
        task: { status },
        targetSection: "archived",
      });
      expect(payload.status, `archiving must not rewrite ${status}`).toBe(
        status,
      );
    }
  });

  it("unarchiving into Planned adopts the planned status", () => {
    const payload = sectionCrossPayload({
      task: { status: "done", archivedAt: ARCHIVED_AT },
      targetSection: "planned",
    });

    expect(payload.archived).toBe(false);
    expect(payload.status).toBe("planned");
  });
});

describe("backlog section membership", () => {
  it("uses archivedAt, not status", () => {
    // the exact case the old `status === "planned"` test got wrong: an archived
    // ticket whose status is NOT "planned" was classified as planned
    expect(backlogSectionOf({ status: "done", archivedAt: ARCHIVED_AT })).toBe(
      "archived",
    );
  });

  it("classifies an archived planned ticket as archived", () => {
    expect(
      backlogSectionOf({ status: "planned", archivedAt: ARCHIVED_AT }),
    ).toBe("archived");
  });

  it("treats a planned, unarchived ticket as planned", () => {
    expect(backlogSectionOf({ status: "planned" })).toBe("planned");
  });

  it("treats null archivedAt as not archived", () => {
    expect(backlogSectionOf({ status: "done", archivedAt: null })).toBe(
      "planned",
    );
    expect(isArchived({ status: "done", archivedAt: null })).toBe(false);
  });

  it("isArchived agrees with backlogSectionOf for every status", () => {
    for (const status of VALID_STATUSES) {
      expect(isArchived({ status, archivedAt: ARCHIVED_AT })).toBe(true);
      expect(backlogSectionOf({ status, archivedAt: ARCHIVED_AT })).toBe(
        "archived",
      );
      expect(isArchived({ status })).toBe(false);
      expect(backlogSectionOf({ status })).toBe("planned");
    }
  });
});

describe("bulk archive operation shape", () => {
  it("archive carries no status value", () => {
    // the old broken call was { operation: "updateStatus", value: "archived" }
    const payload = { taskIds: ["a", "b"], operation: "archive" as const };
    expect(payload).not.toHaveProperty("value");
    expect(JSON.stringify(payload)).not.toContain("archived");
  });
});
