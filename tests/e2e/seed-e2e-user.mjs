import { createRequire } from "node:module";

// This script lives outside the API workspace, but its runtime dependencies are
// intentionally API dependencies. Resolve from that workspace instead of
// requiring an accidental tests/node_modules hoist.
const requireApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { createId } = requireApi("@paralleldrive/cuid2");
const bcrypt = requireApi("bcryptjs");
const { config } = requireApi("dotenv-mono");
const pg = requireApi("pg");

config();

const EMAIL = process.env.E2E_EMAIL ?? "pw-e2e@entelechia.cloud";
const PASSWORD = process.env.E2E_PASSWORD ?? "KaneoE2E!8823xz";
const NAME = "Playwright E2E";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const now = new Date();
let userId;
const existing = await client.query('select id from "user" where email = $1', [
  EMAIL,
]);

if (existing.rows[0]) {
  userId = existing.rows[0].id;
} else {
  userId = createId();
  await client.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $2, $3, true, $4, $4)`,
    [userId, NAME, EMAIL, now],
  );
}

const hash = await bcrypt.hash(PASSWORD, 10);
const account = await client.query(
  "select id from account where user_id = $1 and provider_id = 'credential'",
  [userId],
);

if (account.rows[0]) {
  await client.query(
    "update account set password = $1, updated_at = $2 where id = $3",
    [hash, now, account.rows[0].id],
  );
} else {
  await client.query(
    `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
     values ($1, $2, 'credential', $3, $4, $5, $5)`,
    [createId(), userId, userId, hash, now],
  );
}

// Attach to an organization with a board. Repo E2E cannot depend on whatever
// GitHub mirror happens to be active: that made list tests silently exercise
// empty states whenever the first mirrored repo had no PRs.
const org = await client.query(
  `select o.id from organization o
   join board b on b.organization_id = o.id
   order by o.created_at limit 1`,
);
const organizationId = org.rows[0]?.id;
if (!organizationId) throw new Error("No organization with a board found");

const member = await client.query(
  "select id, role from organization_member where organization_id = $1 and user_id = $2",
  [organizationId, userId],
);
if (member.rows[0]) {
  if (member.rows[0].role !== "owner") {
    await client.query(
      "update organization_member set role = 'owner' where id = $1",
      [member.rows[0].id],
    );
  }
} else {
  await client.query(
    `insert into organization_member (id, organization_id, user_id, role, joined_at)
     values ($1, $2, $3, 'owner', $4)`,
    [createId(), organizationId, userId, now],
  );
}

// Deterministic local mirror. It deliberately has no GitHub installation: list
// and detail UI should work from mirrored data, and E2E must not depend on a
// third-party repository retaining a particular issue/PR forever.
const fixtureRepo = await client.query(
  `insert into repo (id, organization_id, provider, owner, name, url, default_branch, is_private, is_active, created_at, updated_at)
   values ($1, $2, 'github', 'kaneo-e2e', 'repo-fixtures', 'https://github.com/kaneo-e2e/repo-fixtures', 'main', true, true, $3, $3)
   on conflict (organization_id, provider, owner, name)
   do update set updated_at = excluded.updated_at
   returning id, owner, name`,
  [createId(), organizationId, now],
);
const repoId = fixtureRepo.rows[0].id;

await client.query(
  `insert into repo_issue (id, repo_id, number, title, body, state, author_login, labels, comment_count, url, external_created_at, external_updated_at, created_at, updated_at)
   values ($1, $2, 101, 'Fixture issue with a deliberately long title for list truncation coverage', 'Fixture issue body.', 'open', 'kaneo-e2e', $3::jsonb, 2, 'https://github.com/kaneo-e2e/repo-fixtures/issues/101', $4, $4, $4, $4)
   on conflict (repo_id, number) do update set title = excluded.title, labels = excluded.labels, updated_at = excluded.updated_at`,
  [
    createId(),
    repoId,
    JSON.stringify([
      { name: "fixture", color: "0366d6" },
      { name: "e2e", color: "0e8a16" },
    ]),
    now,
  ],
);
await client.query(
  `insert into repo_pull_request (id, repo_id, number, title, body, state, is_draft, author_login, labels, comment_count, url, external_created_at, external_updated_at, created_at, updated_at)
   values ($1, $2, 202, 'Fixture pull request with a deliberately long title for list truncation coverage', 'Fixture pull request body.', 'open', false, 'kaneo-e2e', $3::jsonb, 3, 'https://github.com/kaneo-e2e/repo-fixtures/pull/202', $4, $4, $4, $4)
   on conflict (repo_id, number) do update set title = excluded.title, labels = excluded.labels, updated_at = excluded.updated_at`,
  [
    createId(),
    repoId,
    JSON.stringify([
      { name: "fixture", color: "0366d6" },
      { name: "e2e", color: "0e8a16" },
    ]),
    now,
  ],
);
const repo = { rows: fixtureRepo.rows };
const board = await client.query(
  "select id, slug from board where organization_id = $1 order by created_at limit 1",
  [organizationId],
);

console.log(
  JSON.stringify(
    {
      email: EMAIL,
      userId,
      organizationId,
      repoId: repo.rows[0]?.id,
      repoSlug: `${repo.rows[0]?.owner}/${repo.rows[0]?.name}`,
      boardId: board.rows[0]?.id,
    },
    null,
    2,
  ),
);

await client.end();
