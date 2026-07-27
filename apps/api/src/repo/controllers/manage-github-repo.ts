import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Octokit } from "octokit";
import db from "../../database";
import {
  githubUserGrantTable,
  repoTable,
  userTable,
} from "../../database/schema";
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
  milestone?: number | null;
};

type CloseReason = "completed" | "not_planned";

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

export async function getGitHubRepoClient(repoId: string) {
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
    updates.state !== undefined ||
    updates.milestone !== undefined
  ) {
    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.name,
      issue_number,
      title: updates.title,
      body: updates.body,
      state: updates.state,
      milestone: updates.milestone,
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
  userId,
}: {
  repoId: string;
  number: number;
  body: string;
  userId: string;
}) {
  const { repo, octokit: installationOctokit } = await getGitHubRepoClient(repoId);
  // This is deliberately a dedicated grant, separate from sign-in OAuth.
  // Sign-in commonly has user:email only; delegated identity has repo scope.
  const [githubAccount] = await db
    .select({ accessToken: githubUserGrantTable.accessToken })
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, "github-delegation"),
      ),
    )
    .limit(1);
  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  // Better Auth persists the OAuth token on the linked GitHub account. Prefer
  // it so GitHub records the real Kaneo member as the comment author. The
  // configured SSO scope may not grant repository access, and tokens may be
  // revoked, so preserve the installation-token path as a reliable fallback.
  let octokit = installationOctokit;
  let author = "github-app";
  let commentBody = body;
  if (githubAccount?.accessToken) {
    octokit = new Octokit({ auth: githubAccount.accessToken });
    author = "github-user";
  } else {
    commentBody = `${body}\n\n---\n_Posted by ${user?.name ?? "a Kaneo user"} via Kaneo._`;
  }

  let data;
  try {
    ({ data } = await octokit.rest.issues.createComment({
      owner: repo.owner, repo: repo.name, issue_number: number, body: commentBody,
    }));
  } catch (error) {
    // A linked token may be sign-in-only or revoked; degrade to the App bot.
    if (author !== "github-user") throw error;
    author = "github-app";
    commentBody = `${body}\n\n---\n_Posted by ${user?.name ?? "a Kaneo user"} via Kaneo._`;
    ({ data } = await installationOctokit.rest.issues.createComment({
      owner: repo.owner, repo: repo.name, issue_number: number, body: commentBody,
    }));
  }

  // Comments are represented by the mirror's comment count, so refresh before
  // returning rather than making a local count assumption.
  await syncGitHubRepo(repoId);
  return {
    id: String(data.id),
    url: data.html_url,
    createdAt: new Date(data.created_at),
    author,
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
