import type { Repo } from "@/types/repo";

type GitHubIssueRelation = {
  html_url?: string | null;
  number?: number;
  repository_url?: string | null;
};

function repositoryPath(url?: string | null) {
  if (!url) return null;

  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const [owner, name] =
      segments[0] === "repos" ? segments.slice(1, 3) : segments.slice(0, 2);
    return owner && name ? `${owner}/${name}`.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a GitHub issue relation to its local Kaneo repository mirror.
 *
 * GitHub relation responses include `repository_url`; `html_url` is retained as
 * a fallback for older responses that omit it. A relation only receives an
 * in-app route when its repository is connected to this organization.
 */
export function getRepoIssueRelationLink(
  relation: GitHubIssueRelation,
  repos: Repo[],
) {
  if (!relation.number) return null;

  const relationRepository =
    repositoryPath(relation.repository_url) ??
    repositoryPath(relation.html_url);
  if (!relationRepository) return null;

  const repo = repos.find(
    (candidate) =>
      `${candidate.owner}/${candidate.name}`.toLowerCase() ===
      relationRepository,
  );

  return repo ? { number: relation.number, repoId: repo.id } : null;
}
