import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { config } from "dotenv-mono";
import pg from "pg";

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
  await client.query("update account set password = $1, updated_at = $2 where id = $3", [
    hash,
    now,
    account.rows[0].id,
  ]);
} else {
  await client.query(
    `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
     values ($1, $2, 'credential', $3, $4, $5, $5)`,
    [createId(), userId, userId, hash, now],
  );
}

// Attach to an organization that already owns a mirrored repo so repo-centric
// specs have real GitHub issues/PRs to assert against.
const org = await client.query(
  `select o.id from organization o
   join repo r on r.organization_id = o.id
   order by o.created_at limit 1`,
);
const organizationId = org.rows[0]?.id;
if (!organizationId) throw new Error("No organization with a repo found");

const member = await client.query(
  "select id, role from organization_member where organization_id = $1 and user_id = $2",
  [organizationId, userId],
);
if (member.rows[0]) {
  if (member.rows[0].role !== "owner") {
    await client.query("update organization_member set role = 'owner' where id = $1", [
      member.rows[0].id,
    ]);
  }
} else {
  await client.query(
    `insert into organization_member (id, organization_id, user_id, role, joined_at)
     values ($1, $2, $3, 'owner', $4)`,
    [createId(), organizationId, userId, now],
  );
}

const repo = await client.query(
  "select id, owner, name from repo where organization_id = $1 limit 1",
  [organizationId],
);
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
