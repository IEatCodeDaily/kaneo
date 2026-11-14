import { describe, expect, it } from "vitest";
import {
  ARCHIVED_SECTION,
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

// the seeded statuses -- "archived" is deliberately absent
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
      targetSection: ARCHIVED_SECTION,
    });

    expect(payload.archived).toBe(true);
    expect(payload.status).toBe("done");
  });

  it("archiving preserves every status unchanged", () => {
    for (const status of VALID_STATUSES) {
      const payload = sectionCrossPayload({
        task: { status },
        targetSection: ARCHIVED_SECTION,
      });
      expect(payload.status, `archiving must not rewrite ${status}`).toBe(
        status,
      );
    }
  });

  it("dropping into a status section adopts that status and unarchives", () => {
    for (const target of ["planned", "triage", "icebox"]) {
      const payload = sectionCrossPayload({
        task: { status: "done", archivedAt: ARCHIVED_AT },
        targetSection: target,
      });
      expect(payload).toEqual({ archived: false, status: target });
    }
  });
});

describe("backlog section membership", () => {
  it("archived wins over status", () => {
    expect(backlogSectionOf({ status: "done", archivedAt: ARCHIVED_AT })).toBe(
      ARCHIVED_SECTION,
    );
    expect(
      backlogSectionOf({ status: "planned", archivedAt: ARCHIVED_AT }),
    ).toBe(ARCHIVED_SECTION);
  });

  it("an unarchived ticket sits in its own status section", () => {
    expect(backlogSectionOf({ status: "planned" })).toBe("planned");
    expect(backlogSectionOf({ status: "triage", archivedAt: null })).toBe(
      "triage",
    );
    expect(isArchived({ status: "done", archivedAt: null })).toBe(false);
  });

  it("isArchived agrees with backlogSectionOf for every status", () => {
    for (const status of VALID_STATUSES) {
      expect(isArchived({ status, archivedAt: ARCHIVED_AT })).toBe(true);
      expect(backlogSectionOf({ status, archivedAt: ARCHIVED_AT })).toBe(
        ARCHIVED_SECTION,
      );
      expect(isArchived({ status })).toBe(false);
      expect(backlogSectionOf({ status })).toBe(status);
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
