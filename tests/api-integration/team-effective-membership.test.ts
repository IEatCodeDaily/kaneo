import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import {
  getEffectiveTeamIdsForUser,
  getEffectiveTeamMembers,
  wouldCreateTeamCycle,
} from "../../apps/api/src/team/effective-membership";
import { resetTestDatabase } from "./helpers/database";
import { createOrganizationMember } from "./helpers/fixtures";

/**
 * Sub-teams: members of a sub-team count as members of every ancestor team,
 * resolved at query time with provenance ("from sub-team X").
 */

async function createTeam(
  organizationId: string,
  name: string,
  parentTeamId: string | null = null,
) {
  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      name,
      organizationId,
      parentTeamId,
      createdAt: new Date(),
    })
    .returning();
  return team;
}

async function createUser(name: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();
  return user;
}

async function addMember(teamId: string, userId: string) {
  await db.insert(schema.teamMemberTable).values({
    id: `tm-${randomUUID()}`,
    teamId,
    userId,
    createdAt: new Date(),
  });
}

describe("effective team membership (sub-teams)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("a sub-team member counts as a member of every ancestor", async () => {
    const { organization } = await createOrganizationMember();
    const grandparent = await createTeam(organization.id, "Engineering");
    const parent = await createTeam(
      organization.id,
      "Platform",
      grandparent.id,
    );
    const child = await createTeam(organization.id, "Infra", parent.id);
    const user = await createUser("Deep Member");
    await addMember(child.id, user.id);

    const ids = await getEffectiveTeamIdsForUser(user.id);
    expect(new Set(ids)).toEqual(
      new Set([child.id, parent.id, grandparent.id]),
    );
  });

  it("effective members carry sub-team provenance; direct members do not", async () => {
    const { organization } = await createOrganizationMember();
    const parent = await createTeam(organization.id, "Engineering");
    const sub = await createTeam(organization.id, "Infra", parent.id);
    const direct = await createUser("Direct");
    const inherited = await createUser("Inherited");
    await addMember(parent.id, direct.id);
    await addMember(sub.id, inherited.id);

    const members = await getEffectiveTeamMembers(parent.id);
    const byUser = new Map(members.map((m) => [m.userId, m]));

    expect(byUser.get(direct.id)).toMatchObject({
      viaTeamId: null,
      viaTeamName: null,
    });
    expect(byUser.get(inherited.id)).toMatchObject({
      viaTeamId: sub.id,
      viaTeamName: "Infra",
    });
  });

  it("direct membership wins over inherited for the same user", async () => {
    const { organization } = await createOrganizationMember();
    const parent = await createTeam(organization.id, "Engineering");
    const sub = await createTeam(organization.id, "Infra", parent.id);
    const both = await createUser("Both");
    await addMember(parent.id, both.id);
    await addMember(sub.id, both.id);

    const members = await getEffectiveTeamMembers(parent.id);
    const row = members.find((m) => m.userId === both.id);
    expect(row).toMatchObject({ viaTeamId: null, viaTeamName: null });
    // and exactly once, not one row per path
    expect(members.filter((m) => m.userId === both.id)).toHaveLength(1);
  });

  it("membership does NOT flow downward (parent member is not a sub-team member)", async () => {
    const { organization } = await createOrganizationMember();
    const parent = await createTeam(organization.id, "Engineering");
    const sub = await createTeam(organization.id, "Infra", parent.id);
    const topOnly = await createUser("Top Only");
    await addMember(parent.id, topOnly.id);

    const subMembers = await getEffectiveTeamMembers(sub.id);
    expect(subMembers.find((m) => m.userId === topOnly.id)).toBeUndefined();
    const ids = await getEffectiveTeamIdsForUser(topOnly.id);
    expect(ids).not.toContain(sub.id);
  });

  it("wouldCreateTeamCycle rejects self and descendants, allows siblings", async () => {
    const { organization } = await createOrganizationMember();
    const a = await createTeam(organization.id, "A");
    const b = await createTeam(organization.id, "B", a.id);
    const c = await createTeam(organization.id, "C", b.id);
    const sibling = await createTeam(organization.id, "S");

    expect(await wouldCreateTeamCycle(a.id, a.id)).toBe(true);
    expect(await wouldCreateTeamCycle(a.id, c.id)).toBe(true); // c descends from a
    expect(await wouldCreateTeamCycle(c.id, a.id)).toBe(false); // deepening is fine
    expect(await wouldCreateTeamCycle(a.id, sibling.id)).toBe(false);
  });

  it("terminates on a pre-existing cycle in the data", async () => {
    const { organization } = await createOrganizationMember();
    const a = await createTeam(organization.id, "A");
    const b = await createTeam(organization.id, "B", a.id);
    // Corrupt the data directly: a → b → a. The API rejects this; the DB does
    // not constrain it, and the resolver must terminate anyway.
    await db.execute(
      sql`UPDATE team SET parent_team_id = ${b.id} WHERE id = ${a.id}`,
    );
    const user = await createUser("Cycle Rider");
    await addMember(a.id, user.id);

    const ids = await getEffectiveTeamIdsForUser(user.id);
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
    const members = await getEffectiveTeamMembers(a.id);
    expect(members.map((m) => m.userId)).toContain(user.id);
  });
});
