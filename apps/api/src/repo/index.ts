import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import { createGithubRepo } from "./controllers/create-github-repo";
import createRepoCtrl from "./controllers/create-repo";
import deleteRepoCtrl from "./controllers/delete-repo";
import getRepoCtrl from "./controllers/get-repo";
import { getRepoIssue } from "./controllers/get-repo-issue";
import {
  closeGitHubIssue,
  createGitHubMilestone,
  listGitHubMilestones,
  markGitHubIssueDuplicate,
  unmarkGitHubIssueDuplicate,
  updateGitHubMilestone,
} from "./controllers/github-issue-management";
import { getRepoPullRequest } from "./controllers/get-repo-pull-request";
import { getGitHubRepoMetadata } from "./controllers/github-repo-metadata";
import listRepoIssuesCtrl from "./controllers/list-repo-issues";
import listRepoPullRequestsCtrl from "./controllers/list-repo-pull-requests";
import listReposCtrl from "./controllers/list-repos";
import {
  createGitHubItemComment,
  mergeGitHubPullRequest,
  updateGitHubItem,
} from "./controllers/manage-github-repo";
import {
  addRepoItemTaskLink,
  removeRepoItemTaskLink,
} from "./controllers/repo-task-links";
import { toRepoResponse, toRepoResponses } from "./controllers/repo-response";
import updateRepoCtrl from "./controllers/update-repo";
import { repoOrganizationAccess } from "./repo-organization-access";
import { syncRepo } from "./services/sync-gitea-repo";

// NOTE: the permission statement vocabulary in @kaneo/permissions is
// `board` | `task` | `label` | `organization` — there is no `repo` verb yet.
// Until one is added, repo writes reuse the `board` create/update verbs so
// existing roles (viewer read-only, member create, admin full) keep working.
// Reads only require organization membership, same as boards.

const repoSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  provider: v.string(),
  owner: v.string(),
  name: v.string(),
  externalId: v.nullable(v.string()),
  url: v.string(),
  description: v.nullable(v.string()),
  defaultBranch: v.nullable(v.string()),
  isPrivate: v.boolean(),
  config: v.nullable(v.record(v.string(), v.unknown())),
  isActive: v.boolean(),
  lastSyncedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const repoWithCountsSchema = v.object({
  ...repoSchema.entries,
  openIssueCount: v.number(),
  openPullRequestCount: v.number(),
});

const paginationSchema = v.object({
  total: v.number(),
  page: v.number(),
  pageSize: v.number(),
  totalPages: v.number(),
});

const repoIssueSchema = v.object({
  id: v.string(),
  repoId: v.string(),
  number: v.number(),
  externalId: v.nullable(v.string()),
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  authorLogin: v.nullable(v.string()),
  authorAvatarUrl: v.nullable(v.string()),
  assigneeLogins: v.nullable(v.array(v.string())),
  labels: v.nullable(
    v.array(v.object({ name: v.string(), color: v.optional(v.string()) })),
  ),
  commentCount: v.number(),
  url: v.string(),
  externalCreatedAt: v.nullable(v.date()),
  externalUpdatedAt: v.nullable(v.date()),
  closedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const repoItemUpdateSchema = v.object({
  title: v.optional(v.string()),
  body: v.optional(v.nullable(v.string())),
  state: v.optional(v.picklist(["open", "closed"] as const)),
  labels: v.optional(v.array(v.string())),
  assignees: v.optional(v.array(v.string())),
  milestone: v.optional(v.nullable(v.number())),
});

const repoPullRequestSchema = v.object({
  id: v.string(),
  repoId: v.string(),
  number: v.number(),
  externalId: v.nullable(v.string()),
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  isDraft: v.boolean(),
  authorLogin: v.nullable(v.string()),
  authorAvatarUrl: v.nullable(v.string()),
  headBranch: v.nullable(v.string()),
  baseBranch: v.nullable(v.string()),
  labels: v.nullable(
    v.array(v.object({ name: v.string(), color: v.optional(v.string()) })),
  ),
  commentCount: v.number(),
  url: v.string(),
  externalCreatedAt: v.nullable(v.date()),
  externalUpdatedAt: v.nullable(v.date()),
  mergedAt: v.nullable(v.date()),
  closedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const githubRepoMetadataSchema = v.object({
  labels: v.array(
    v.object({
      name: v.string(),
      color: v.string(),
      description: v.nullable(v.string()),
    }),
  ),
  assignableUsers: v.array(
    v.object({ login: v.string(), avatarUrl: v.string() }),
  ),
  milestones: v.array(
    v.object({
      number: v.number(),
      title: v.string(),
      state: v.string(),
      dueOn: v.nullable(v.string()),
    }),
  ),
});

const repo = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listRepos",
      tags: ["Repos"],
      description: "Get all repos in a organization",
      responses: {
        200: {
          description: "List of repos with open issue and pull request counts",
          content: {
            "application/json": {
              schema: resolver(v.array(repoWithCountsSchema)),
            },
          },
        },
      },
    }),
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      const repos = await listReposCtrl(organizationId);
      return c.json(toRepoResponses(repos));
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createRepo",
      tags: ["Repos"],
      description: "Connect a new repo to a organization",
      responses: {
        200: {
          description: "Repo created successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        organizationId: v.string(),
        provider: v.picklist(["github", "gitea"] as const),
        owner: v.string(),
        name: v.string(),
        url: v.string(),
        externalId: v.optional(v.string()),
        description: v.optional(v.string()),
        defaultBranch: v.optional(v.string()),
        isPrivate: v.optional(v.boolean()),
        config: v.optional(v.record(v.string(), v.unknown())),
        installationId: v.optional(v.number()),
      }),
    ),
    organizationAccess.fromBody(),
    // No `repo` permission verb exists yet — reuse `board: ["create"]`.
    requireOrganizationPermission({ board: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const newRepo =
        body.provider === "github"
          ? await createGithubRepo({
              organizationId,
              installationId: body.installationId ?? -1,
              owner: body.owner,
              name: body.name,
            })
          : await createRepoCtrl({
              organizationId,
              provider: body.provider,
              owner: body.owner,
              name: body.name,
              url: body.url,
              externalId: body.externalId,
              description: body.description,
              defaultBranch: body.defaultBranch,
              isPrivate: body.isPrivate,
              config: body.config,
            });
      return c.json(toRepoResponse(newRepo));
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getRepo",
      tags: ["Repos"],
      description: "Get a specific repo by ID",
      responses: {
        200: {
          description: "Repo details",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const repoData = await getRepoCtrl(id, organizationId);
      return c.json(toRepoResponse(repoData));
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateRepo",
      tags: ["Repos"],
      description: "Update an existing repo",
      responses: {
        200: {
          description: "Repo updated successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        config: v.optional(v.record(v.string(), v.unknown())),
        installationId: v.optional(v.number()),
      }),
    ),
    repoOrganizationAccess(),
    // No `repo` permission verb exists yet — reuse `board: ["update"]`.
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updatedRepo = await updateRepoCtrl(id, organizationId, updates);
      return c.json(toRepoResponse(updatedRepo));
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteRepo",
      tags: ["Repos"],
      description:
        "Delete a repo by ID — cascades to its issues and pull requests",
      responses: {
        200: {
          description: "Repo deleted successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    // No `repo` permission verb exists yet — reuse `board: ["update"]`.
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const deletedRepo = await deleteRepoCtrl(id, organizationId);
      return c.json(toRepoResponse(deletedRepo));
    },
  )
  .get(
    "/:id/issues/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(v.string(), v.transform(Number)),
      }),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await getRepoIssue(id, number, c.get("organizationId")));
    },
  )
  .get(
    "/:id/pull-requests/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(v.string(), v.transform(Number)),
      }),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await getRepoPullRequest(id, number, c.get("organizationId")),
      );
    },
  )
  .get(
    "/:id/issues",
    describeRoute({
      operationId: "listRepoIssues",
      tags: ["Repos"],
      description: "Get mirrored issues for a repo, newest number first",
      responses: {
        200: {
          description: "Paginated list of repo issues",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  data: v.array(repoIssueSchema),
                  pagination: paginationSchema,
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          state: v.optional(v.picklist(["open", "closed", "all"] as const)),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
        }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const filters = c.req.valid("query") || {};
      const organizationId = c.get("organizationId");
      const issues = await listRepoIssuesCtrl(id, organizationId, filters);
      return c.json(issues);
    },
  )
  .get(
    "/:id/pull-requests",
    describeRoute({
      operationId: "listRepoPullRequests",
      tags: ["Repos"],
      description: "Get mirrored pull requests for a repo, newest number first",
      responses: {
        200: {
          description: "Paginated list of repo pull requests",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  data: v.array(repoPullRequestSchema),
                  pagination: paginationSchema,
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          state: v.optional(
            v.picklist(["open", "closed", "merged", "all"] as const),
          ),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
        }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const filters = c.req.valid("query") || {};
      const organizationId = c.get("organizationId");
      const pullRequests = await listRepoPullRequestsCtrl(
        id,
        organizationId,
        filters,
      );
      return c.json(pullRequests);
    },
  )
  .post(
    "/:id/:itemType/:number/task-links",
    validator("param", v.object({ id: v.string(), itemType: v.picklist(["issues", "pull-requests"] as const), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) })),
    validator("json", v.object({ taskId: v.string() })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, itemType, number } = c.req.valid("param");
      const link = await addRepoItemTaskLink({
        repoId: id, number, taskId: c.req.valid("json").taskId,
        itemType: itemType === "issues" ? "issue" : "pullRequest",
        organizationId: c.get("organizationId"),
      });
      return c.json(link);
    },
  )
  .delete(
    "/:id/:itemType/:number/task-links/:taskId",
    validator("param", v.object({ id: v.string(), itemType: v.picklist(["issues", "pull-requests"] as const), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), taskId: v.string() })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, itemType, number, taskId } = c.req.valid("param");
      return c.json(await removeRepoItemTaskLink({
        repoId: id, number, taskId,
        itemType: itemType === "issues" ? "issue" : "pullRequest",
        organizationId: c.get("organizationId"),
      }));
    },
  )
  .post(
    "/:id/sync",
    describeRoute({
      operationId: "syncRepo",
      tags: ["Repos"],
      description:
        "Pull the repository's issues and pull requests from its provider. Upserts on (repo, number); never creates tasks.",
      responses: {
        200: {
          description: "Sync completed",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ issues: v.number(), pullRequests: v.number() }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await syncRepo(id);
      return c.json(result);
    },
  )
  .get(
    "/:id/github-metadata",
    describeRoute({
      operationId: "getGitHubRepoMetadata",
      tags: ["Repos"],
      description:
        "Live GitHub labels, assignable users and milestones for a repo, for building pickers. Non-GitHub repos return empty arrays.",
      responses: {
        200: {
          description: "GitHub repo metadata",
          content: {
            "application/json": {
              schema: resolver(githubRepoMetadataSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) =>
      c.json(await getGitHubRepoMetadata(c.req.valid("param").id)),
  )
  .get(
    "/:id/milestones",
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => c.json(await listGitHubMilestones(c.req.valid("param").id)),
  )
  .post(
    "/:id/milestones",
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ title: v.pipe(v.string(), v.minLength(1)), description: v.optional(v.string()), dueOn: v.optional(v.string()) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => c.json(await createGitHubMilestone(c.req.valid("param").id, c.req.valid("json"))),
  )
  .patch(
    "/:id/milestones/:number",
    validator("param", v.object({ id: v.string(), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) })),
    validator("json", v.object({ title: v.optional(v.string()), description: v.optional(v.nullable(v.string())), dueOn: v.optional(v.nullable(v.string())), state: v.optional(v.picklist(["open", "closed"] as const)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => { const { id, number } = c.req.valid("param"); return c.json(await updateGitHubMilestone(id, number, c.req.valid("json"))); },
  )
  .post(
    "/:id/issues/:number/close",
    validator("param", v.object({ id: v.string(), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) })),
    validator("json", v.object({ reason: v.picklist(["completed", "not_planned"] as const) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => { const { id, number } = c.req.valid("param"); return c.json(await closeGitHubIssue({ repoId: id, number, reason: c.req.valid("json").reason })); },
  )
  .post(
    "/:id/issues/:number/duplicate",
    validator("param", v.object({ id: v.string(), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) })),
    validator("json", v.object({ canonicalNumber: v.pipe(v.number(), v.integer(), v.minValue(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => { const { id, number } = c.req.valid("param"); return c.json(await markGitHubIssueDuplicate({ repoId: id, number, canonicalNumber: c.req.valid("json").canonicalNumber })); },
  )
  .delete(
    "/:id/issues/:number/duplicate",
    validator("param", v.object({ id: v.string(), number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => { const { id, number } = c.req.valid("param"); return c.json(await unmarkGitHubIssueDuplicate({ repoId: id, number })); },
  )
  .patch(
    "/:id/issues/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", repoItemUpdateSchema),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await updateGitHubItem({
          repoId: id,
          number,
          kind: "issue",
          updates: c.req.valid("json"),
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/comments",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ body: v.pipe(v.string(), v.minLength(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await createGitHubItemComment({
          repoId: id,
          number,
          body: c.req.valid("json").body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id/pull-requests/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", repoItemUpdateSchema),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await updateGitHubItem({
          repoId: id,
          number,
          kind: "pullRequest",
          updates: c.req.valid("json"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/comments",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ body: v.pipe(v.string(), v.minLength(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await createGitHubItemComment({
          repoId: id,
          number,
          body: c.req.valid("json").body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/merge",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.optional(
        v.object({
          method: v.optional(
            v.picklist(["merge", "squash", "rebase"] as const),
          ),
        }),
      ),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await mergeGitHubPullRequest({
          repoId: id,
          number,
          method: c.req.valid("json")?.method,
        }),
      );
    },
  );

export default repo;
