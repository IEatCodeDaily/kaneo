import { and, eq } from "drizzle-orm";
import { Octokit } from "octokit";
import db from "../../database";
import {
  githubUserGrantTable,
  organizationGithubInstallationTable,
} from "../../database/schema";
import { getGithubApp } from "../../plugins/github/utils/github-app";

type Installation = {
  id: number;
  account?: {
    id?: number;
    login?: string;
    type?: string;
    avatar_url?: string;
  } | null;
  repository_selection?: string;
  permissions?: Record<string, string>;
};

/**
 * Installations belong to the GitHub App, not to a single Kaneo organization.
 * Listing them unscoped leaked every tenant's GitHub account into every org's
 * settings page (and let any org claim any installation).
 *
 * An installation may be offered to an organization only when the acting user
 * demonstrably administers the GitHub account behind it:
 *   - personal account: the login matches the user's connected GitHub login
 *   - organization account: the user has an active `admin` membership
 *
 * `GET /user/installations` would be the natural check, but it requires a
 * GitHub App user-to-server token while our delegation grant is an OAuth App
 * token, so it returns 403. We enumerate App installations and verify control
 * per account instead.
 */
export async function listAdministeredInstallations({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const app = getGithubApp();
  if (!app) return [];

  const [grant] = await db
    .select({
      accessToken: githubUserGrantTable.accessToken,
      githubLogin: githubUserGrantTable.githubLogin,
    })
    .from(githubUserGrantTable)
    .where(
      and(
        eq(githubUserGrantTable.userId, userId),
        eq(githubUserGrantTable.providerId, "github-delegation"),
      ),
    )
    .limit(1);

  // Without a delegated identity we cannot prove control of anything, so offer
  // nothing rather than leaking the full installation list.
  if (!grant?.accessToken) return [];

  const userOctokit = new Octokit({ auth: grant.accessToken });
  const installations = (await app.octokit.paginate(
    app.octokit.rest.apps.listInstallations,
    { per_page: 100 },
  )) as Installation[];

  const claimed = await db
    .select({
      installationId: organizationGithubInstallationTable.installationId,
      organizationId: organizationGithubInstallationTable.organizationId,
    })
    .from(organizationGithubInstallationTable);
  const claimedElsewhere = new Set(
    claimed
      .filter((row) => row.organizationId !== organizationId)
      .map((row) => row.installationId),
  );

  const checked = await Promise.all(
    installations.map(async (installation) => {
      if (claimedElsewhere.has(installation.id)) return null;
      const login = installation.account?.login;
      if (!login) return null;

      if (installation.account?.type !== "Organization") {
        return login.toLowerCase() === grant.githubLogin.toLowerCase()
          ? installation
          : null;
      }

      try {
        const { data } = await userOctokit.request(
          "GET /user/memberships/orgs/{org}",
          { org: login },
        );
        return data.role === "admin" && data.state === "active"
          ? installation
          : null;
      } catch {
        // Not a member, or the grant lacks read:org — do not offer it.
        return null;
      }
    }),
  );

  return checked.filter((item): item is Installation => item !== null);
}

export function toInstallationResponse(installation: Installation) {
  return {
    installationId: installation.id,
    accountId: installation.account?.id,
    accountLogin: installation.account?.login,
    accountType: installation.account?.type,
    accountAvatarUrl: installation.account?.avatar_url,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
  };
}
