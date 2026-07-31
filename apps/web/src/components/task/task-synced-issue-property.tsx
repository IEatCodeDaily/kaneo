/**
 * Deprecated (#75).
 *
 * The synced GitHub issue used to be repeated in the properties info bar and
 * again under the label list, on top of the Resources list and the topbar.
 * Users read that as chaos, so the remark now lives in exactly one place: the
 * Resources list, where it carries a `[Synced]` badge (see
 * `task-resources.tsx` + `resource-sync-badge.tsx`).
 *
 * The component is kept as an intentional no-op so the properties sidebar keeps
 * compiling while its call sites are cleaned up, and so re-introducing the
 * duplicate requires a deliberate change rather than a stray render.
 */
export default function TaskSyncedIssueProperty(_props: {
  taskId: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  return null;
}
