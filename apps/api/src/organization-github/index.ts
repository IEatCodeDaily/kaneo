import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { organizationGithubInstallationTable } from "../database/schema";
import { getGithubApp } from "../plugins/github/utils/github-app";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import { organizationAccess } from "../utils/organization-access-middleware";

const organizationGithub = new Hono<{ Variables: { organizationId: string } }>()
  .get("/", validator("query", v.object({ organizationId: v.string() })), organizationAccess.fromQuery(), async (c) => {
    const organizationId = c.get("organizationId");
    return c.json(await db.select().from(organizationGithubInstallationTable).where(eq(organizationGithubInstallationTable.organizationId, organizationId)));
  })
  .get("/available", validator("query", v.object({ organizationId: v.string() })), organizationAccess.fromQuery(), requireOrganizationPermission({ organization: ["manage_settings"] }), async () => {
    const app = getGithubApp();
    if (!app) throw new HTTPException(503, { message: "GitHub App is not configured" });
    const installations = await app.octokit.paginate(app.octokit.rest.apps.listInstallations, { per_page: 100 });
    return new Response(JSON.stringify(installations.map((i) => ({
      installationId: i.id, accountId: i.account?.id, accountLogin: i.account?.login,
      accountType: (i.account as { type?: string } | undefined)?.type, accountAvatarUrl: i.account?.avatar_url,
      repositorySelection: i.repository_selection, permissions: i.permissions,
    }))), { headers: { "Content-Type": "application/json" } });
  })
  .post("/", validator("json", v.object({ organizationId: v.string(), installationId: v.number() })), organizationAccess.fromBody(), requireOrganizationPermission({ organization: ["manage_settings"] }), async (c) => {
    const { organizationId, installationId } = c.req.valid("json");
    const app = getGithubApp();
    if (!app) throw new HTTPException(503, { message: "GitHub App is not configured" });
    const { data: installation } = await app.octokit.rest.apps.getInstallation({ installation_id: installationId });
    if (!installation.account) throw new HTTPException(400, { message: "GitHub installation has no account" });
    const account = installation.account as { id: number; login: string; type?: string; avatar_url?: string };
    const [saved] = await db.insert(organizationGithubInstallationTable).values({
      organizationId, installationId, accountId: account.id, accountLogin: account.login,
      accountType: account.type ?? "Unknown", accountAvatarUrl: account.avatar_url ?? null,
      repositorySelection: installation.repository_selection, permissions: installation.permissions,
    }).onConflictDoUpdate({ target: [organizationGithubInstallationTable.organizationId, organizationGithubInstallationTable.installationId], set: { accountLogin: account.login, accountType: account.type ?? "Unknown", accountAvatarUrl: account.avatar_url ?? null, repositorySelection: installation.repository_selection, permissions: installation.permissions, updatedAt: new Date() } }).returning();
    return c.json(saved);
  })
  .get("/repositories", validator("query", v.object({ organizationId: v.string() })), organizationAccess.fromQuery(), async (c) => {
    const organizationId = c.get("organizationId");
    const installations = await db.select().from(organizationGithubInstallationTable).where(eq(organizationGithubInstallationTable.organizationId, organizationId));
    const app = getGithubApp(); if (!app) throw new HTTPException(503, { message: "GitHub App is not configured" });
    const repositories = [] as unknown[];
    for (const installation of installations) {
      const octokit = await app.getInstallationOctokit(installation.installationId);
      const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
      repositories.push(...repos.map((repo) => ({ id: repo.id, owner: repo.owner.login, name: repo.name, fullName: repo.full_name, url: repo.html_url, description: repo.description, isPrivate: repo.private, defaultBranch: repo.default_branch, installationId: installation.installationId })));
    }
    return c.json(repositories);
  })
  .delete("/:installationId", validator("param", v.object({ installationId: v.pipe(v.string(), v.transform(Number)) })), validator("query", v.object({ organizationId: v.string() })), organizationAccess.fromQuery(), requireOrganizationPermission({ organization: ["manage_settings"] }), async (c) => {
    const { installationId } = c.req.valid("param"); const organizationId = c.get("organizationId");
    await db.delete(organizationGithubInstallationTable).where(and(eq(organizationGithubInstallationTable.organizationId, organizationId), eq(organizationGithubInstallationTable.installationId, installationId)));
    return c.json({ success: true });
  });
export default organizationGithub;
