import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  identityFromTeamsClaims,
  TEAMS_CLIENT_IDS,
  teamsSso,
  teamsSsoConfigFromEnv,
} from "../../apps/api/src/utils/teams-sso";

const config = {
  tenantId: "tid-noov",
  clientId: "client-1",
  allowedDomains: ["noovoleum.com"],
};
const OID = "11111111-2222-3333-4444-555555555555";
const good = {
  tid: "tid-noov",
  azp: TEAMS_CLIENT_IDS[0],
  scp: "access_as_user",
  oid: OID,
  preferred_username: "Raisal.Wardana@Noovoleum.com",
};

describe("identityFromTeamsClaims", () => {
  it("returns oid + lower-cased email for a Teams token from our tenant", () => {
    expect(identityFromTeamsClaims(good, config)).toEqual({
      oid: OID,
      email: "raisal.wardana@noovoleum.com",
    });
  });

  it("rejects wrong tenant, non-Teams caller, missing scope/oid, foreign domain", () => {
    for (const bad of [
      { tid: "other" },
      { azp: "some-other-tenant-app" },
      { scp: "User.Read" },
      { oid: "" },
      { preferred_username: "x@gmail.com" },
      { preferred_username: "" },
    ]) {
      expect(() =>
        identityFromTeamsClaims({ ...good, ...bad }, config),
      ).toThrow();
    }
  });
});

describe("teamsSsoConfigFromEnv", () => {
  it("is off unless tenant, client and domains are all set", () => {
    expect(teamsSsoConfigFromEnv({})).toBeNull();
    expect(
      teamsSsoConfigFromEnv({
        TEAMS_SSO_TENANT_ID: "t",
        TEAMS_SSO_CLIENT_ID: "c",
      }),
    ).toBeNull();
    expect(
      teamsSsoConfigFromEnv({
        TEAMS_SSO_TENANT_ID: "t",
        TEAMS_SSO_CLIENT_ID: "c",
        TEAMS_SSO_ALLOWED_DOMAINS: " Noovoleum.com ,",
      }),
    ).toEqual({
      tenantId: "t",
      clientId: "c",
      allowedDomains: ["noovoleum.com"],
    });
  });
});

describe("POST /teams-sso/sign-in (real endpoint, in-memory db)", () => {
  type Db = Record<string, Record<string, unknown>[]>;
  let db: Db;
  let auth: ReturnType<typeof betterAuth>;
  let sign: (claims: Record<string, unknown>) => Promise<string>;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwks = async () => publicKey;
    sign = (claims) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(`https://login.microsoftonline.com/${config.tenantId}/v2.0`)
        .setAudience(config.clientId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    db = { user: [], session: [], account: [], verification: [] };
    auth = betterAuth({
      baseURL: "https://task.example.com",
      secret: "test-secret-with-at-least-32-characters!!",
      database: memoryAdapter(db),
      plugins: [teamsSso(config, jwks)],
    });
    const now = new Date();
    db.user.push(
      {
        id: "u-verified",
        email: "raisal.wardana@noovoleum.com",
        emailVerified: true,
        name: "R",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "u-unverified",
        email: "squatter@noovoleum.com",
        emailVerified: false,
        name: "S",
        createdAt: now,
        updatedAt: now,
      },
    );
  });

  const call = (token: string) =>
    auth.handler(
      new Request("https://task.example.com/api/auth/teams-sso/sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://task.example.com",
        },
        body: JSON.stringify({ token }),
      }),
    );

  it("signs in the verified user, links the oid, and sets a session cookie", async () => {
    const res = await call(await sign(good));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("session_token");
    expect(db.account).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "u-verified",
          providerId: "teams-sso",
          accountId: OID,
        }),
      ]),
    );
  });

  it("keeps resolving by oid after the Entra email changes", async () => {
    const res = await call(
      await sign({ ...good, preferred_username: "raisal.new@noovoleum.com" }),
    );
    expect(res.status).toBe(200);
    const sessions = db.session.filter((s) => s.userId === "u-verified");
    expect(sessions.length).toBe(2);
  });

  it("refuses to link an account whose email was never verified", async () => {
    const res = await call(
      await sign({
        ...good,
        oid: "99999999-2222-3333-4444-555555555555",
        preferred_username: "squatter@noovoleum.com",
      }),
    );
    expect(res.status).toBe(403);
    expect(db.session.some((s) => s.userId === "u-unverified")).toBe(false);
  });

  it("rejects a token not requested by Teams (azp) and a forged signature", async () => {
    expect((await call(await sign({ ...good, azp: "rogue-app" }))).status).toBe(
      401,
    );
    const forged = `${(await sign(good)).slice(0, -4)}AAAA`;
    expect((await call(forged)).status).toBe(401);
  });
});
