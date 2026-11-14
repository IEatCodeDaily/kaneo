import type Task from "@/types/task";

/**
 * #226: archival is ORTHOGONAL to status.
 *
 * Migration 0062 moved archival off `task.status` onto `task.archived_at` and
 * dropped `"archived"` from the valid status vocabulary. Any code that still
 * writes `status: "archived"` now fails validation with:
 *
 *   Invalid status "archived". Valid statuses for this board: to-do, ...
 *
 * These helpers are the single source of truth for the two rules that fixes it:
 *   1. an archived ticket KEEPS its real workflow status
 *   2. section membership is decided by `archivedAt` first, never by a status
 *      named "archived"
 *
 * Backlog sections are the board's off-board statuses (Triage, Planned, any
 * custom backlog-type status — each a board row) plus Archived. A section id
 * is therefore a status slug, or `"archived"`.
 */

export const ARCHIVED_SECTION = "archived";

export type BacklogSection = string;

type ArchivableTask = Pick<Task, "status"> & { archivedAt?: string | null };

/** Which backlog section a row belongs to: Archived wins over its status. */
export function backlogSectionOf(task: ArchivableTask): BacklogSection {
  return task.archivedAt ? ARCHIVED_SECTION : task.status;
}

export function isArchived(task: ArchivableTask): boolean {
  return Boolean(task.archivedAt);
}

/**
 * What crossing a backlog section boundary must persist.
 *
 * Archiving toggles `archived_at` and leaves status alone, so a Done ticket is
 * still Done while archived. Dropping into a status section sets that status
 * (and unarchives) — the section IS a real status the ticket adopts.
 */
export function sectionCrossPayload({
  task,
  targetSection,
}: {
  task: ArchivableTask;
  targetSection: BacklogSection;
}): { archived: boolean; status: string } {
  if (targetSection === ARCHIVED_SECTION) {
    return { archived: true, status: task.status };
  }
  return { archived: false, status: targetSection };
}
