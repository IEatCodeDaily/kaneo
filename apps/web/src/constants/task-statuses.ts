/**
 * Web copy of the ticket status model (API source of truth:
 * `apps/api/src/task/status-taxonomy.ts`).
 *
 * Every status is a board row (`GET /column/:boardId`), typed by `statusType`.
 * Nothing here is a status list — pickers, settings and the Backlog page read
 * the board's rows. This file only knows the seven TYPES and the default slugs
 * (for display-label i18n of seeded statuses).
 *
 * Archive is DELIBERATELY absent: archival is `task.archived_at`, orthogonal to
 * status. An archived ticket retains whatever status it had.
 */

/** Status types, in display rank (= board/picker/settings order). */
export const STATUS_TYPES = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
  "duplicate",
] as const;

export type StatusType = (typeof STATUS_TYPES)[number];

/** Picker section a type belongs to. */
export const STATUS_TYPE_SECTION: Record<
  StatusType,
  "backlog" | "active" | "closed"
> = {
  triage: "backlog",
  backlog: "backlog",
  unstarted: "active",
  started: "active",
  completed: "closed",
  canceled: "closed",
  duplicate: "closed",
};

/** Seeded slugs whose label is translated (custom statuses show their name). */
export const DEFAULT_STATUS_NAMES: Record<string, string> = {
  triage: "Triage",
  planned: "Planned",
  "to-do": "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  done: "Done",
  canceled: "Canceled",
  duplicate: "Duplicate",
};

/** Seeded slug for each type — preferred target of "Move to Backlog" etc. */
export const DEFAULT_SLUG_BY_TYPE: Record<StatusType, string> = {
  triage: "triage",
  backlog: "planned",
  unstarted: "to-do",
  started: "in-progress",
  completed: "done",
  canceled: "canceled",
  duplicate: "duplicate",
};

function rank(statusType: string | null | undefined) {
  const index = (STATUS_TYPES as readonly string[]).indexOf(statusType ?? "");
  return index === -1 ? STATUS_TYPES.length : index;
}

/** Display order: type rank, then position within the type. */
export function sortStatuses<
  T extends { statusType?: string | null; position?: number },
>(statuses: readonly T[]): T[] {
  return [...statuses].sort(
    (a, b) =>
      rank(a.statusType) - rank(b.statusType) ||
      (a.position ?? 0) - (b.position ?? 0),
  );
}

/**
 * A board's statuses grouped into picker sections (Backlog / Active / Closed),
 * empty sections dropped, rows in display order.
 */
export function groupStatusesForPicker<
  T extends { statusType?: string | null; position?: number },
>(statuses: readonly T[]) {
  const sections = [
    { id: "backlog" as const, statuses: [] as T[] },
    { id: "active" as const, statuses: [] as T[] },
    { id: "closed" as const, statuses: [] as T[] },
  ];
  for (const status of sortStatuses(statuses)) {
    const id = STATUS_TYPE_SECTION[status.statusType as StatusType] ?? "active";
    sections.find((section) => section.id === id)?.statuses.push(status);
  }
  return sections.filter((section) => section.statuses.length > 0);
}

/** The board's status for a type: seeded slug when present, else the first. */
export function pickStatusByType<
  T extends { slug: string; statusType?: string | null; position?: number },
>(statuses: readonly T[], statusType: StatusType): T | undefined {
  const ofType = sortStatuses(
    statuses.filter((status) => status.statusType === statusType),
  );
  return (
    ofType.find((status) => status.slug === DEFAULT_SLUG_BY_TYPE[statusType]) ??
    ofType[0]
  );
}
