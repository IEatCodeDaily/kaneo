/**
 * The ticket status model (2026-11, docs/plans/2026-11-14-ticket-status-model.md).
 *
 * ## One rule
 *
 * A status is a `column` row on its board. Its `status_type` decides where it
 * appears and how it behaves. There are no hardcoded statuses: Planned, Triage
 * and Duplicate are seeded rows exactly like To Do and Done, so every board can
 * rename, re-icon, hide, add to or reorder them.
 *
 * ## Slugs are a persistence contract
 *
 * `task.status` stores the row's slug. Seeded slugs (`to-do`, `in-progress`,
 * `in-review`, `done`, `planned`, `triage`, `canceled`, `duplicate`) are frozen:
 * never rename one, never re-point one at a different meaning.
 *
 * ## Labels never change (owner direction)
 *
 * The seven TYPE names below are classifications, not display names. A board's
 * backlog-type default is still labelled "Planned".
 *
 * ## Archive is NOT a status
 *
 * Archival is `task.archived_at` (migration 0062), orthogonal to status — an
 * archived ticket keeps its real status. "archived" appears nowhere here.
 */

/** Status types, in display rank. The order here IS the board/picker order. */
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

/** Types that close a ticket: progress, reminders, My Tasks, history seal. */
export const CLOSED_STATUS_TYPES: readonly StatusType[] = [
  "completed",
  "canceled",
  "duplicate",
];

/** Types that live on the Backlog page (off-board) by default. */
export const BACKLOG_STATUS_TYPES: readonly StatusType[] = [
  "triage",
  "backlog",
];

export function isStatusType(value: unknown): value is StatusType {
  return (
    typeof value === "string" &&
    (STATUS_TYPES as readonly string[]).includes(value)
  );
}

export function isClosedStatusType(statusType: string | null): boolean {
  return (
    statusType !== null &&
    (CLOSED_STATUS_TYPES as readonly string[]).includes(statusType)
  );
}

/** Rank of a type in display order; unknown sorts last. */
export function statusTypeRank(statusType: string | null): number {
  const rank = (STATUS_TYPES as readonly string[]).indexOf(statusType ?? "");
  return rank === -1 ? STATUS_TYPES.length : rank;
}

/**
 * The statuses every board is seeded with. Positions are per type (order
 * WITHIN a type group). `showOnBoard`: backlog types live on the Backlog page;
 * Duplicate is picker-only (owner ruling) — boards can flip any of these.
 */
export const DEFAULT_STATUSES = [
  {
    name: "Triage",
    slug: "triage",
    statusType: "triage",
    position: 0,
    showOnBoard: false,
  },
  {
    name: "Planned",
    slug: "planned",
    statusType: "backlog",
    position: 0,
    showOnBoard: false,
  },
  {
    name: "To Do",
    slug: "to-do",
    statusType: "unstarted",
    position: 0,
    showOnBoard: true,
  },
  {
    name: "In Progress",
    slug: "in-progress",
    statusType: "started",
    position: 0,
    showOnBoard: true,
  },
  {
    name: "In Review",
    slug: "in-review",
    statusType: "started",
    position: 1,
    showOnBoard: true,
  },
  {
    name: "Done",
    slug: "done",
    statusType: "completed",
    position: 0,
    showOnBoard: true,
  },
  {
    name: "Canceled",
    slug: "canceled",
    statusType: "canceled",
    position: 0,
    showOnBoard: true,
  },
  {
    name: "Duplicate",
    slug: "duplicate",
    statusType: "duplicate",
    position: 0,
    showOnBoard: false,
  },
] as const satisfies readonly {
  name: string;
  slug: string;
  statusType: StatusType;
  position: number;
  showOnBoard: boolean;
}[];

/** Seeded slug for each type — the preferred target of by-type fallbacks. */
export const DEFAULT_SLUG_BY_TYPE: Record<StatusType, string> = {
  triage: "triage",
  backlog: "planned",
  unstarted: "to-do",
  started: "in-progress",
  completed: "done",
  canceled: "canceled",
  duplicate: "duplicate",
};

/** Default type for a seeded slug (create-column default, tests). */
export const STATUS_TYPE_BY_SLUG: Record<string, StatusType> =
  Object.fromEntries(
    DEFAULT_STATUSES.map((status) => [status.slug, status.statusType]),
  );

/** Sort comparator: type rank, then position within the type. */
export function compareStatuses(
  a: { statusType: string | null; position: number },
  b: { statusType: string | null; position: number },
): number {
  return (
    statusTypeRank(a.statusType) - statusTypeRank(b.statusType) ||
    a.position - b.position
  );
}

/**
 * Pick the status a by-type fallback should land on: the type's seeded slug
 * when the board still has it, else the first row of that type. Every former
 * hardcoded fallback (`"to-do"`, `"planned"`, `"done"`) routes through here so
 * a board that replaced a seeded status keeps working.
 */
export function pickStatusByType<
  T extends { slug: string; statusType: string | null; position: number },
>(statuses: readonly T[], statusType: StatusType): T | undefined {
  const ofType = statuses
    .filter((status) => status.statusType === statusType)
    .sort(compareStatuses);
  return (
    ofType.find((status) => status.slug === DEFAULT_SLUG_BY_TYPE[statusType]) ??
    ofType[0]
  );
}
