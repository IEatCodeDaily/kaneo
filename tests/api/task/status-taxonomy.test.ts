import { describe, expect, it } from "vitest";
import {
  applyStatusOrder,
  BACKLOG_STATUS_SLUGS,
  CLOSED_STATUS_SLUGS,
  isBacklogStatus,
  isClosedStatus,
  isKnownStatus,
  NON_COLUMN_STATUS_SLUGS,
  STATUS_DEFINITIONS,
  STATUS_SLUGS,
} from "../../../apps/api/src/task/status-taxonomy";

/**
 * #226 CONTRACT TEST for the task status vocabulary.
 *
 * Status slugs are stored in `task.status` on ~1,741 live rows, so they are a
 * persistence contract. Renaming or re-pointing one silently rewrites the
 * meaning of every row already saved with it — no migration, no error, no diff.
 * These tests exist to make that failure loud instead of silent.
 */

/**
 * Slugs that existed BEFORE #226 and must never move or change meaning.
 * Verified against the live database at implementation time:
 *   to-do 1549, done 172, planned 13, in-progress 4, in-review 1
 */
const FROZEN_SLUGS = [
  "to-do",
  "in-progress",
  "in-review",
  "done",
  "planned",
] as const;

describe("status taxonomy persistence contract", () => {
  it("still contains every pre-existing slug", () => {
    for (const slug of FROZEN_SLUGS) {
      expect(STATUS_SLUGS).toContain(slug);
    }
  });

  it("keeps every slug unique", () => {
    expect(new Set(STATUS_SLUGS).size).toBe(STATUS_SLUGS.length);
  });

  it("keeps the pre-existing slugs' closed/backlog semantics unchanged", () => {
    // Re-pointing any of these would reclassify already-stored rows.
    expect(isClosedStatus("to-do")).toBe(false);
    expect(isClosedStatus("in-progress")).toBe(false);
    expect(isClosedStatus("in-review")).toBe(false);
    expect(isClosedStatus("done")).toBe(true);
    expect(isClosedStatus("planned")).toBe(false);

    expect(isBacklogStatus("planned")).toBe(true);
    expect(isBacklogStatus("to-do")).toBe(false);
    expect(isBacklogStatus("done")).toBe(false);
  });

  it("does NOT treat archived as a status", () => {
    /*
      The ticket correction: "Archive is a separate status to hide it from all
      views. Archived item retains its status." Archival is `task.archived_at`
      (migration 0062). If `archived` ever reappears here, archiving would again
      destroy the ticket's real workflow state.
    */
    expect(STATUS_SLUGS).not.toContain("archived");
    expect(isKnownStatus("archived")).toBe(false);
  });
});

describe("#226 appended statuses", () => {
  it("adds Triage, Canceled and Duplicate", () => {
    expect(STATUS_SLUGS).toContain("triage");
    expect(STATUS_SLUGS).toContain("canceled");
    expect(STATUS_SLUGS).toContain("duplicate");
  });

  it("groups them as the ticket specifies", () => {
    const bySlug = new Map(STATUS_DEFINITIONS.map((d) => [d.slug, d]));
    expect(bySlug.get("triage")?.group).toBe("backlog");
    expect(bySlug.get("canceled")?.group).toBe("cancelled");
    expect(bySlug.get("duplicate")?.group).toBe("duplicate");

    // Unstarted / Started / Finished, verbatim from the ticket.
    expect(bySlug.get("to-do")?.group).toBe("unstarted");
    expect(bySlug.get("in-progress")?.group).toBe("started");
    expect(bySlug.get("in-review")?.group).toBe("started");
    expect(bySlug.get("done")?.group).toBe("finished");
  });

  it("puts Triage ABOVE Planned by default", () => {
    // "Triage is similar to Planned. by default it's above planned."
    expect(BACKLOG_STATUS_SLUGS).toEqual(["triage", "planned"]);
  });

  it("treats Canceled and Duplicate as closed but NOT backlog", () => {
    expect(CLOSED_STATUS_SLUGS).toContain("canceled");
    expect(CLOSED_STATUS_SLUGS).toContain("duplicate");
    expect(isBacklogStatus("canceled")).toBe(false);
    expect(isBacklogStatus("duplicate")).toBe(false);
  });

  it("exposes non-column statuses so validation accepts them without a column row", () => {
    for (const slug of ["planned", "triage", "canceled", "duplicate"]) {
      expect(NON_COLUMN_STATUS_SLUGS).toContain(slug);
    }
    // Kanban statuses DO have column rows and must not be in this list.
    for (const slug of ["to-do", "in-progress", "in-review", "done"]) {
      expect(NON_COLUMN_STATUS_SLUGS).not.toContain(slug);
    }
  });
});

describe("applyStatusOrder", () => {
  it("orders by the board configuration", () => {
    expect(applyStatusOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps unconfigured statuses instead of dropping them", () => {
    // A partially configured board must still show every status.
    expect(applyStatusOrder(["a", "b", "c"], ["c"])).toEqual(["c", "a", "b"]);
  });

  it("ignores configured slugs that are not present", () => {
    expect(applyStatusOrder(["a", "b"], ["zzz", "b", "a"])).toEqual(["b", "a"]);
  });

  /** NEGATIVE CONTROLS: no configuration must not reorder anything. */
  it("falls back to canonical order when no configuration exists", () => {
    expect(applyStatusOrder(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
    expect(applyStatusOrder(["a", "b", "c"], undefined)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(applyStatusOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });
});
