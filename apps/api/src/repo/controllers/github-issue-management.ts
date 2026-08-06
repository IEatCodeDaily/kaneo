import { HTTPException } from "hono/http-exception";
import { getGitHubRepoClient } from "./manage-github-repo";
import { getRepoIssue } from "./get-repo-issue";
import { syncGitHubRepo } from "../services/sync-github-repo";

type CloseReason = "completed" | "not_planned";

export async function closeGitHubIssue({
  repoId,
  number,
  reason,
}: {
  repoId: string;
  number: number;
  reason: CloseReason;
}) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
    state: "closed",
    state_reason: reason,
  });
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

async function getIssueNodeId(repoId: string, number: number) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.get({
    owner: repo.owner,
    repo: repo.name,
    issue_number: number,
  });
  if (!data.node_id) {
    throw new HTTPException(422, {
      message: "GitHub did not return an issue node ID",
    });
  }
  return { nodeId: data.node_id, octokit };
}

export async function markGitHubIssueDuplicate({
  repoId,
  number,
  canonicalNumber,
}: {
  repoId: string;
  number: number;
  canonicalNumber: number;
}) {
  if (number === canonicalNumber) {
    throw new HTTPException(400, { message: "An issue cannot duplicate itself" });
  }
  const [duplicate, canonical] = await Promise.all([
    getIssueNodeId(repoId, number),
    getIssueNodeId(repoId, canonicalNumber),
  ]);
  await duplicate.octokit.graphql(
    "mutation($duplicateId: ID!, $canonicalId: ID!) { markIssueAsDuplicate(input: {duplicateId: $duplicateId, canonicalId: $canonicalId}) { issue { id } } }",
    { duplicateId: duplicate.nodeId, canonicalId: canonical.nodeId },
  );
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function unmarkGitHubIssueDuplicate({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  const issue = await getIssueNodeId(repoId, number);
  await issue.octokit.graphql(
    "mutation($issueId: ID!) { undoMarkIssueAsDuplicate(input: {issueId: $issueId}) { issue { id } } }",
    { issueId: issue.nodeId },
  );
  await syncGitHubRepo(repoId);
  return getRepoIssue(repoId, number);
}

export async function listGitHubMilestones(repoId: string) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  return octokit.paginate("GET /repos/{owner}/{repo}/milestones", {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    per_page: 100,
  });
}

export async function createGitHubMilestone(
  repoId: string,
  input: { title: string; description?: string; dueOn?: string },
) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.createMilestone({
    owner: repo.owner,
    repo: repo.name,
    title: input.title,
    description: input.description,
    due_on: input.dueOn,
  });
  return data;
}

export async function updateGitHubMilestone(
  repoId: string,
  number: number,
  input: {
    title?: string;
    description?: string | null;
    dueOn?: string | null;
    state?: "open" | "closed";
  },
) {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.issues.updateMilestone({
    owner: repo.owner,
    repo: repo.name,
    milestone_number: number,
    title: input.title,
    description: input.description,
    due_on: input.dueOn,
    state: input.state,
  });
  return data;
}
