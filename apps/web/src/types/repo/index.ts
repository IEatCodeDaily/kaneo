export type RepoProvider = string;

export type Repo = {
  id: string;
  organizationId: string;
  provider: RepoProvider;
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string | null;
  isPrivate: boolean | null;
  isActive: boolean | null;
  lastSyncedAt: string | null;
  openIssueCount: number;
  openPullRequestCount: number;
};

export type RepoLabel = {
  name: string;
  color: string | null;
};

export type RepoIssueState = "open" | "closed";

export type RepoIssue = {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: RepoIssueState;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  labels: RepoLabel[];
  commentCount: number;
  url: string;
  externalCreatedAt: string | null;
  closedAt: string | null;
};

export type RepoPullRequestState = "open" | "closed" | "merged";

export type RepoPullRequest = {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: RepoPullRequestState;
  isDraft: boolean | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  headBranch: string | null;
  baseBranch: string | null;
  labels: RepoLabel[];
  commentCount: number;
  url: string;
  externalCreatedAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
};

export type RepoIssueStateFilter = "open" | "closed" | "all";

export type RepoPullRequestStateFilter = "open" | "closed" | "merged" | "all";

// The API returns paginated collections as { data, pagination } — see
// apps/api/src/repo/index.ts. Keep these aligned with the server response.
export type RepoPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RepoIssuesResponse = {
  data: RepoIssue[];
  pagination: RepoPagination;
};

export type RepoPullRequestsResponse = {
  data: RepoPullRequest[];
  pagination: RepoPagination;
};
