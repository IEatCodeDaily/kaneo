import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

const AUTH_FILE = "tests/e2e/.auth/user.json";
const FIXTURE_FILE = "tests/e2e/.auth/fixtures.json";

/**
 * Signs in once with the seeded E2E account and persists storage state so specs
 * don't each pay the auth round-trip. Also resolves the organization/repo/board
 * ids the repo-centric specs need, straight from the live API.
 */
async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ??
    process.env.E2E_BASE_URL ??
    "https://kaneo.entelechia.cloud";
  const email = process.env.E2E_EMAIL ?? "pw-e2e@entelechia.cloud";
  const password = process.env.E2E_PASSWORD ?? "KaneoE2E!8823xz";

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // Authenticate through the real API so we exercise the same session cookies
  // the browser would receive from the sign-in form.
  const signIn = await context.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    { data: { email, password } },
  );
  if (!signIn.ok()) {
    throw new Error(
      `E2E sign-in failed (${signIn.status()}): ${await signIn.text()}\n` +
        "Run: node tests/e2e/seed-e2e-user.mjs (from apps/api) to seed the account.",
    );
  }

  const session = await context.request.get(`${baseURL}/api/auth/get-session`);
  const sessionBody = await session.json();
  const organizationId: string | undefined =
    sessionBody?.session?.activeOrganizationId ?? undefined;

  const orgsResponse = await context.request.get(
    `${baseURL}/api/auth/organization/list`,
  );
  const orgs = orgsResponse.ok() ? await orgsResponse.json() : [];
  const resolvedOrganizationId =
    organizationId ?? (Array.isArray(orgs) ? orgs[0]?.id : undefined);

  if (!resolvedOrganizationId) {
    throw new Error("E2E account has no organization membership");
  }

  // Make the org active so authenticated dashboard routes resolve.
  await context.request.post(`${baseURL}/api/auth/organization/set-active`, {
    data: { organizationId: resolvedOrganizationId },
  });

  const reposResponse = await context.request.get(
    `${baseURL}/api/repo?organizationId=${resolvedOrganizationId}`,
  );
  const repos = reposResponse.ok() ? await reposResponse.json() : [];
  // The seed script owns this local mirror. Prefer it over arbitrary connected
  // GitHub repos so E2E always has deterministic issue/PR fixtures.
  const repo = Array.isArray(repos)
    ? repos.find(
        (candidate) =>
          candidate.owner === "kaneo-e2e" && candidate.name === "repo-fixtures",
      )
    : undefined;

  const boardsResponse = await context.request.get(
    `${baseURL}/api/board?organizationId=${resolvedOrganizationId}`,
  );
  const boards = boardsResponse.ok() ? await boardsResponse.json() : [];
  const board = Array.isArray(boards) ? boards[0] : undefined;

  let issueNumber: number | undefined;
  let pullNumber: number | undefined;
  if (repo?.id) {
    const issues = await context.request.get(
      `${baseURL}/api/repo/${repo.id}/issues?state=all&limit=20`,
    );
    if (issues.ok()) {
      const body = await issues.json();
      issueNumber = body?.data?.[0]?.number;
    }
    const pulls = await context.request.get(
      `${baseURL}/api/repo/${repo.id}/pull-requests?state=all&limit=20`,
    );
    if (pulls.ok()) {
      const body = await pulls.json();
      pullNumber = body?.data?.[0]?.number;
    }
  }

  for (const file of [AUTH_FILE, FIXTURE_FILE]) {
    if (!existsSync(dirname(file)))
      mkdirSync(dirname(file), { recursive: true });
  }

  await context.storageState({ path: AUTH_FILE });
  writeFileSync(
    FIXTURE_FILE,
    JSON.stringify(
      {
        baseURL,
        organizationId: resolvedOrganizationId,
        repoId: repo?.id ?? null,
        repoOwner: repo?.owner ?? null,
        repoName: repo?.name ?? null,
        boardId: board?.id ?? null,
        issueNumber: issueNumber ?? null,
        pullNumber: pullNumber ?? null,
      },
      null,
      2,
    ),
  );

  await page.close();
  await context.close();
  await browser.close();
}

export default globalSetup;
