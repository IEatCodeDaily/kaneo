/**
 * GitHub events that can change the issues/PRs the repo mirror copies.
 *
 * Everything else is denied: each webhook delivery used to pay a full
 * re-pagination of every issue and pull request in the repo, so a busy CI
 * day (workflow_job/workflow_run storms) stacked dozens of concurrent
 * redundant syncs in memory until the API heap OOM'd (IT-54). Eventual
 * consistency is preserved by the allowlisted events plus the 15-minute
 * stale-repo scheduler.
 */
const MIRROR_SYNC_EVENTS = new Set([
  "issues",
  "pull_request",
  "push",
  "label",
  "issue_comment",
]);

export function shouldMirrorEvent(eventName: string): boolean {
  return MIRROR_SYNC_EVENTS.has(eventName);
}
