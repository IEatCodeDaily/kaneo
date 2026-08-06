import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoIssueTable, repoTable } from "../../database/schema";
import { getGitHubRepoClient } from "./manage-github-repo";
import { getRepoItemTaskLinks } from "./repo-task-links";

export async function getRepoIssue(
  repoId: string,
  number: number,
  organizationId?: string,
) {
  const issue = await db.query.repoIssueTable.findFirst({
    where: and(eq(repoIssueTable.repoId, repoId), eq(repoIssueTable.number, number)),
  });
  if (!issue) throw new HTTPException(404, { message: "Issue not found" });
  const result = {
    ...issue,
    taskLinks: organizationId
      ? await getRepoItemTaskLinks(repoId, number, "issue", organizationId)
      : [],
  };
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });
  if (!repo || repo.provider !== "github") return result;

  const { octokit } = await getGitHubRepoClient(repoId);
  const request = {
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    per_page: 100,
    headers: { accept: "application/vnd.github+json" },
  };
  const [comments, timeline, subIssues, detail] = await Promise.all([
    octokit.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
      request,
    ),
    octokit.paginate(
      "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
      request,
    ),
    // GitHub exposes this endpoint only where sub-issues are available.
    octokit
      .paginate(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
        request,
      )
      .then((data) => ({ supported: true, data }))
      .catch((error: unknown) => {
        const status = (error as { status?: number }).status;
        if (status === 404 || status === 410 || status === 422) {
          return { supported: false, data: [] as unknown[] };
        }
        throw error;
      }),
    // The mirror has no milestone column, so read the current assignment
    // live rather than letting the UI assume "no milestone".
    octokit.rest.issues.get({
      owner: repo.owner,
      repo: repo.name,
      issue_number: number,
    }),
  ]);

  // GitHub represents development relationships as cross-reference timeline
  // events. Expose linked PRs separately while retaining raw timeline data.
  const linkedPullRequests = timeline.flatMap((event: any) => {
    const source = event?.source?.issue;
    if (!source?.pull_request) return [];
    return [{
      number: source.number,
      title: source.title,
      url: source.html_url,
      state: source.state,
      mergedAt: source.pull_request.merged_at ?? null,
    }];
  });

  return {
    ...result,
    github: {
      comments,
      timeline,
      linkedPullRequests,
      milestone: detail.data.milestone
        ? {
            number: detail.data.milestone.number,
            title: detail.data.milestone.title,
          }
        : null,
      stateReason: detail.data.state_reason ?? null,
      subIssues: subIssues.data,
      subIssuesSupported: subIssues.supported,
    },
  };
}
