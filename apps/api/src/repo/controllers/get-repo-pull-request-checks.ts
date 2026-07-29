import { getGitHubRepoClient } from "./manage-github-repo";

export type GitHubCheckEntry = {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
};

export type GitHubPullRequestChecks = {
  /** Roll-up across every check run and workflow run; null when there is no CI. */
  conclusion: string | null;
  headSha: string;
  checks: GitHubCheckEntry[];
  runs: GitHubCheckEntry[];
};

/**
 * Precedence used to roll individual results up into one badge. Anything still
 * running outranks a finished result so the UI never reports "success" while a
 * required job is in flight; failures outrank neutral/skipped outcomes.
 */
const CONCLUSION_PRECEDENCE = [
  "pending",
  "failure",
  "timed_out",
  "cancelled",
  "action_required",
  "stale",
  "neutral",
  "skipped",
  "success",
];

function rollUp(entries: GitHubCheckEntry[]): string | null {
  // No CI configured on the PR is a legitimate, successful, empty answer.
  if (entries.length === 0) return null;

  const observed = entries.map((entry) =>
    entry.status === "completed" ? (entry.conclusion ?? "neutral") : "pending",
  );

  for (const candidate of CONCLUSION_PRECEDENCE) {
    if (observed.includes(candidate)) return candidate;
  }
  return observed[0] ?? null;
}

/**
 * Report CI state for a pull request live from GitHub.
 *
 * Two sources are needed because they are genuinely different surfaces: the
 * Checks API covers every App-reported check run, while Actions workflow runs
 * carry the workflow-level view (including runs that produced no check run yet).
 * Both are filtered to the PR's head SHA so an older push cannot leak in.
 */
export async function getRepoPullRequestChecks({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}): Promise<GitHubPullRequestChecks> {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
  });
  const headSha = pullRequest.head.sha;

  const [checkRuns, workflowRuns] = await Promise.all([
    octokit.paginate(octokit.rest.checks.listForRef, {
      owner: repo.owner,
      repo: repo.name,
      ref: headSha,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.actions.listWorkflowRunsForRepo, {
      owner: repo.owner,
      repo: repo.name,
      head_sha: headSha,
      per_page: 100,
    }),
  ]);

  const checks: GitHubCheckEntry[] = checkRuns.map((run) => ({
    name: run.name,
    status: run.status,
    conclusion: run.conclusion ?? null,
    startedAt: run.started_at ?? null,
    completedAt: run.completed_at ?? null,
    url: run.html_url ?? pullRequest.html_url,
  }));

  const runs: GitHubCheckEntry[] = workflowRuns.map((run) => ({
    name: run.name ?? run.display_title ?? `Run #${run.run_number}`,
    status: run.status ?? "queued",
    conclusion: run.conclusion ?? null,
    // Workflow runs have no started_at/completed_at; their created/updated
    // timestamps are the closest equivalent the API exposes.
    startedAt: run.run_started_at ?? run.created_at ?? null,
    completedAt: run.status === "completed" ? (run.updated_at ?? null) : null,
    url: run.html_url,
  }));

  return {
    conclusion: rollUp([...checks, ...runs]),
    headSha,
    checks,
    runs,
  };
}

export default getRepoPullRequestChecks;
