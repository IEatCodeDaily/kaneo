import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { Octokit } from "octokit";
import db from "../../database";
import {
  githubUserGrantTable,
  repoTable,
  userTable,
} from "../../database/schema";
import {
  getGithubApp,
  getInstallationOctokit,
} from "../../plugins/github/utils/github-app";
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

function configuredInstallationId(
  repo: typeof repoTable.$inferSelect,
): number | null {
  const config = (repo.config ?? {}) as { installationId?: number | string };
  const raw = config.installationId;
  const installationId = typeof raw === "string" ? Number(raw) : raw;
  return installationId && Number.isInteger(installationId)
    ? installationId
    : null;
}

/**
 * Resolve the live installation ID that can actually reach this repo.
 *
 * A repo's `config.installationId` is a cache, and it goes stale the moment the
 * user uninstalls/reinstalls the GitHub App (GitHub issues a brand new
 * installation ID each time). The old ID then 404s on every token request,
 * which surfaced as blanket 500s across the repo UI.
 *
 * Strategy: ask the App which installation owns `repo.owner`, and persist that
 * so subsequent calls stay cheap. Fall back to the cached ID only if the
 * lookup fails for an unrelated reason.
 */
export async function resolveInstallationId(
  repo: typeof repoTable.$inferSelect,
): Promise<number> {
  const cached = configuredInstallationId(repo);
  const app = getGithubApp();
  if (!app) {
    if (cached) return cached;
    throw new HTTPException(422, {
      message: "GitHub App is not configured on this instance",
    });
  }

  let liveId: number | null = null;
  try {
    // Works for both user- and organization-owned accounts.
    const { data } = await app.octokit.request(
      "GET /users/{username}/installation",
      { username: repo.owner },
    );
    liveId = data.id;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) throw error;
  }

  if (!liveId) {
    throw new HTTPException(422, {
      message: `The Kaneo GitHub App is not installed on "${repo.owner}". Install it for that account, then reload.`,
    });
  }

  if (liveId !== cached) {
    // Self-heal the cache so we stop hammering a dead installation.
    await db
      .update(repoTable)
      .set({
        config: { ...(repo.config ?? {}), installationId: liveId },
        updatedAt: new Date(),
      })
      .where(eq(repoTable.id, repo.id));
  }

  return liveId;
}

/**
 * Reconcile an issue's assignees to an exact list.
 *
 * The pinned Octokit build has addAssignees/removeAssignees but no
 * setAssignees, so calling setAssignees threw a TypeError and every
 * assignee change failed.
 */
async function setGitHubAssignees({
  octokit,
  owner,
  repo,
  issue_number,
  assignees,
}: {
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>;
  owner: string;
  repo: string;
  issue_number: number;
  assignees: string[];
}) {
  const { data } = await octokit.rest.issues.get({ owner, repo, issue_number });
  const current = (data.assignees ?? []).map((user) => user.login);
  const desired = [...new Set(assignees)];
  const toAdd = desired.filter((login) => !current.includes(login));
  const toRemove = current.filter((login) => !desired.includes(login));

  if (toRemove.length > 0) {
    await octokit.rest.issues.removeAssignees({
      owner,
      repo,
      issue_number,
      assignees: toRemove,
    });
  }
  if (toAdd.length > 0) {
    await octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number,
      assignees: toAdd,
    });
  }
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
    octokit: await getInstallationOctokit(await resolveInstallationId(repo)),
  };
}

export async function updateGitHubItem({
  repoId,
  number,
  kind,
  updates,
  userId,
}: {
  repoId: string;
  number: number;
  kind: GitHubItemKind;
  updates: UpdateGitHubItemInput;
  userId?: string;
}) {
  if (Object.keys(updates).length === 0) {
    throw new HTTPException(400, { message: "At least one field is required" });
  }

  // Attribute the change to the acting member, not the Kaneo App bot.
  const { repo, octokit } = await getActingOctokit(repoId, userId);
  const issue_number = number;

  // Batch every field change concurrently instead of serially: GitHub's issue
  // update, labels, and assignees are independent endpoints.
  await Promise.all([
    updates.title !== undefined ||
    updates.body !== undefined ||
    updates.state !== undefined ||
    updates.milestone !== undefined
      ? octokit.rest.issues.update({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          title: updates.title,
          body: updates.body,
          state: updates.state,
          milestone: updates.milestone,
        })
      : Promise.resolve(),
    updates.labels === undefined
      ? Promise.resolve()
      : octokit.rest.issues.setLabels({
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          labels: updates.labels,
        }),
    // This Octokit build exposes addAssignees/removeAssignees but no
    // setAssignees, so reconcile the desired list against the current one.
    updates.assignees === undefined
      ? Promise.resolve()
      : setGitHubAssignees({
          octokit,
          owner: repo.owner,
          repo: repo.name,
          issue_number,
          assignees: updates.assignees,
        }),
  ]);

  // A full repo re-sync made every metadata edit wait on all issues and PRs.
  // Return the fresh single item instead and let the mirror catch up in the
  // background, so the UI responds immediately.
  void syncGitHubRepo(repoId).catch((error) => {
    console.error("[updateGitHubItem] background sync failed", error);
  });

  return kind === "issue"
    ? getRepoIssue(repoId, number)
    : getRepoPullRequest(repoId, number);
}

/**
 * Prefer the acting member's delegated GitHub token so writes are attributed to
 * them instead of the Kaneo App bot. Falls back to the installation token when
 * the user hasn't connected their GitHub account (or the grant was revoked).
 */
async function getActingOctokit(
  repoId: string,
  userId?: string,
): Promise<{
  repo: typeof repoTable.$inferSelect;
  octokit: Octokit;
  actedAsUser: boolean;
}> {
  const { repo, octokit: installationOctokit } =
    await getGitHubRepoClient(repoId);
  if (!userId) {
    return { repo, octokit: installationOctokit, actedAsUser: false };
  }

  const [grant] = await db
    .select({ accessToken: githubUserGrantTable.accessToken })
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, "github-delegation"),
      ),
    )
    .limit(1);

  if (!grant?.accessToken) {
    return { repo, octokit: installationOctokit, actedAsUser: false };
  }

  return {
    repo,
    octokit: new Octokit({ auth: grant.accessToken }),
    actedAsUser: true,
  };
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
  const { repo, octokit: installationOctokit } =
    await getGitHubRepoClient(repoId);
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
      owner: repo.owner,
      repo: repo.name,
      issue_number: number,
      body: commentBody,
    }));
  } catch (error) {
    // A linked token may be sign-in-only or revoked; degrade to the App bot.
    if (author !== "github-user") throw error;
    author = "github-app";
    commentBody = `${body}\n\n---\n_Posted by ${user?.name ?? "a Kaneo user"} via Kaneo._`;
    ({ data } = await installationOctokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: number,
      body: commentBody,
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