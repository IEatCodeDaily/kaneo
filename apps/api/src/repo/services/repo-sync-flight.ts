/**
 * At most one full mirror sync per repo at a time. Webhook bursts (and the
 * manual resync button) used to stack concurrent full paginations of the
 * same repo in memory until the API heap OOM'd (IT-54).
 *
 * Both sync funnels (syncGitHubRepo / syncGiteaRepo) route through here, so
 * every caller — webhooks, the stale-repo scheduler, manual resyncs and
 * issue management — shares one running sync per repo.
 *
 * A caller that joins a running sync may have its change paginated past
 * (the joiner's promise started before the change happened), so joiners
 * mark the repo dirty and one trailing re-run settles it after the current
 * sync finishes. The 30-minute stale-repo scheduler remains the backstop.
 */
export type SyncResult = { issues: number; pullRequests: number };

const inFlight = new Map<string, Promise<SyncResult>>();
const dirty = new Set<string>();

export function runBoundedSync(
  repoId: string,
  run: () => Promise<SyncResult>,
): Promise<SyncResult> {
  const existing = inFlight.get(repoId);
  if (existing) {
    dirty.add(repoId);
    return existing;
  }
  const runPromise = run();
  inFlight.set(repoId, runPromise);
  const settle = () => {
    inFlight.delete(repoId);
    if (dirty.delete(repoId)) {
      void runBoundedSync(repoId, run).catch((error: unknown) => {
        console.error(
          `[Repo Sync] trailing re-sync of repo ${repoId} failed:`,
          error,
        );
      });
    }
  };
  // `then(settle, settle)` observes the rejection without swallowing it for
  // the original caller, who still receives `runPromise` itself.
  runPromise.then(settle, settle);
  return runPromise;
}
