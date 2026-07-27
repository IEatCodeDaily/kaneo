import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoTable } from "../../database/schema";
import { getInstallationOctokit } from "../../plugins/github/utils/github-app";
import { syncGitHubRepo } from "../services/sync-github-repo";
import { getRepoIssue } from "./get-repo-issue";
import { getRepoPullRequest } from "./get-repo-pull-request";

type GitHubItemKind = "issue" | "pullRequest";

type UpdateGitHubItemInput = {
  title?: string;
  body?: string | null;
  state?: "open" | "closed";
  labels?: string[];
  assignees?: string[];
};

function installationIdForRepo(repo: typeof repoTable.$inferSelect): number {
  const config = (repo.config ?? {}) as { installationId?: number | string };
  const raw = config.installationId;
  const installationId = typeof raw === "string" ? Number(raw) : raw;
  if (!installationId || !Number.isInteger(installationId)) {
    throw new HTTPException(422, {
      message: "GitHub repository has no usable installation ID",
    });
  }
  return installationId;
}

async function getGitHubRepoClient(repoId: string) {
  const repo = await db.query.repoTable.findFirst({
    where: eq(repoTable.id, repoId),
  });
  if (!repo) throw new HTTPException(404, { message: "Repo not found" });
  if (repo.provider !== "github") {
    throw new HTTPException(400, {
      message: "GitHub mutations are only supported for GitHub repos",
    });
  }

  return {
    repo,
    octokit: await getInstallationOctokit(installationIdForRepo(repo)),
  };
}

export async function updateGitHubItem({
  repoId,
  number,
  kind,
  updates,
}: {
  repoId: string;
  number: number;
  kind: GitHubItemKind;
  updates: UpdateGitHubItemInput;
}) {
  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "At least one field is required" });
  }

  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const issue_number = number;

  if (
    updates.title !== undefined ||
    updates.body !== undefined ||
    updates.state !== undefined
  ) {
    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.name,
      issue_number,
      title: updates.title,
      body: updates.body,
      state: updates.state,
    });
  }

  await Promise.all([
    updates.labels === undefined
      ? Promise.resolve()
      : octokit.rest.issues.setLabels({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          labels: updates.labels,
        }),
    updates.assignees === undefined
      ? Promise.resolve()
      : octokit.rest.issues.setAssignees({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          assignees: updates.assignees,
        }),
  ]);

  await syncGitHubRepo(repoId);
  return kind === "issue"
    ? getRepoIssue(repoId, number)
    : getRepoPullRequest(repoId, number);
}

export async function createGitHubItemComment({
  repoId,
  number,
  body,
}: {
  repoId: string;
  number: number;
  body: string;
}) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.createComment({
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    body,
  });

  // Comments are represented by the mirror's comment count, so refresh before
  // returning rather than making a local count assumption.
  await syncGitHubRepo(repoId);
  return {
    id: String(data.id),
    url: data.html_url,
    createdAt: new Date(data.created_at),
  };
}

export async function mergeGitHubPullRequest({
  repoId,
  number,
  method,
}: {
  repoId: string;
  number: number;
  method?: "merge" | "squash" | "rebase";
}) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.pulls.merge({
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    merge_method: method,
  });

  if (!data.merged) {
    throw new HTTPException(409, {
      message: data.message || "GitHub pull request could not be merged",
    });
  }

  await syncGitHubRepo(repoId);
  return getRepoPullRequest(repoId, number);
}
