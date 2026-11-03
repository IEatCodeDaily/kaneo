import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The real loader is replaced per-test; keep module import free of a live DB.
const dbm = vi.hoisted(() => ({
  link: [] as Array<{ userId: string; banned?: boolean }>,
  task: null as unknown,
  privilege: "none",
  org: [] as Array<{ name: string }>,
}));
vi.mock("../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => dbm.link }) }),
        where: () => ({ limit: async () => dbm.org }),
      }),
    }),
    query: { taskTable: { findFirst: async () => dbm.task } },
  },
}));
vi.mock("../../apps/api/src/search/controllers/global-search", () => ({
  default: vi.fn(async ({ query }: { query: string }) => ({
    results: query === "box" ? [{ id: "abcdefgh12345678abcdefgh" }] : [],
  })),
}));
vi.mock("../../apps/api/src/identity/resolve-ticket-identity", () => ({
  resolveTicketIdentity: vi.fn(async (org: string, key: string) =>
    org === "noovoleum" && key === "ENG-2"
      ? { ticketId: "abcdefgh12345678abcdefgh" }
      : null,
  ),
}));
vi.mock("../../apps/api/src/resource-access", () => ({
  getResourcePrivilege: vi.fn(async () => dbm.privilege),
  privilegeAllows: (p: string, r: string) =>
    ["none", "view", "edit", "manage"].indexOf(p) >=
    ["none", "view", "edit", "manage"].indexOf(r),
}));

import {
  type CardTask,
  loadCardTask,
  searchCardTasks,
  type TaskRef,
  taskIdFromUrl,
  taskRefFromUrl,
  teamsEndorsedKeys,
  teamsLinkPreviewHandler,
  teamsMessagesHandler,
  teamsUnfurlConfigFromEnv,
  unfurlResponse,
} from "../../apps/api/src/utils/teams-unfurl";

const config = {
  botAppId: "bot-app",
  tenantId: "tid-noov",
  clientUrl: "https://task.example.com",
};
const TASK = "abcdefgh12345678abcdefgh";
const OID = "11111111-2222-3333-4444-555555555555";
const SVC = "https://smba.trafficmanager.net/apac/";
const card: CardTask = {
  key: "IT-43",
  title: "Re-encrypt",
  status: "done",
  priority: "medium",
  assignee: null,
  board: "IT",
  url: "https://task.example.com/x",
};

describe("taskRefFromUrl", () => {
  it("parses the short ticket URL the UI copies", () => {
    expect(
      taskRefFromUrl(
        "https://task.example.com/dashboard/noovoleum/tickets/ENG-2",
        config.clientUrl,
      ),
    ).toEqual({ org: "noovoleum", key: "ENG-2" });
  });
  it("still parses the long form, rejects foreign origins", () => {
    expect(
      taskRefFromUrl(
        `https://task.example.com/dashboard/organization/o/board/b/task/${TASK}`,
        config.clientUrl,
      ),
    ).toEqual({ taskId: TASK });
    expect(
      taskRefFromUrl(
        "https://evil.example.com/dashboard/noovoleum/tickets/ENG-2",
        config.clientUrl,
      ),
    ).toBeNull();
  });
});

describe("taskIdFromUrl", () => {
  it("accepts only task links on our own origin", () => {
    expect(
      taskIdFromUrl(
        `https://task.example.com/dashboard/organization/o/board/b/task/${TASK}`,
        config.clientUrl,
      ),
    ).toBe(TASK);
    expect(
      taskIdFromUrl(
        `https://evil.example.com/board/b/task/${TASK}`,
        config.clientUrl,
      ),
    ).toBeNull();
    expect(
      taskIdFromUrl("https://task.example.com/dashboard", config.clientUrl),
    ).toBeNull();
    expect(taskIdFromUrl("not a url", config.clientUrl)).toBeNull();
  });
});

describe("teamsLinkPreviewHandler", () => {
  const app = new Hono();
  app.get("/p", teamsLinkPreviewHandler);
  const title = async (q: string) => {
    const r = await app.request(`/p?${q}`);
    return r.status === 200
      ? (await r.text()).match(/<title>([^<]*)<\/title>/)?.[1]
      : r.status;
  };
  it("titles a ticket link with org name and key only", async () => {
    dbm.org = [{ name: "Noovoleum RDE" }];
    expect(await title("org=noovoleum&key=app-10")).toBe(
      "Noovoleum RDE · APP-10 | Kaneo",
    );
  });
  it("escapes the org name and drops unknown orgs", async () => {
    dbm.org = [{ name: '<b>"x"&' }];
    expect(await title("org=o&key=A-1")).toBe(
      "&#60;b&#62;&#34;x&#34;&#38; · A-1 | Kaneo",
    );
    dbm.org = [];
    expect(await title("org=ghost&key=A-1")).toBe("A-1 | Kaneo");
  });
  it("404s on malformed input", async () => {
    expect(await title("org=%3Cs%3E&key=A-1")).toBe(404);
    expect(await title("org=o&key=%3Cs%3E-1")).toBe(404);
    expect(await title("org=o")).toBe(404);
  });
});

describe("unfurlResponse", () => {
  it("carries only fields + link, never a description", () => {
    const out = JSON.stringify(unfurlResponse(card));
    expect(out).toContain("IT-43");
    expect(out).toContain('"version":"1.3"');
    expect(out).not.toMatch(/description/i);
  });
  it("opens the Teams tab at the task when the Teams app id is known", () => {
    const out = JSON.stringify(unfurlResponse(card, "app-1"));
    const url = new URL(
      JSON.parse(out).composeExtension.attachments[0].content.actions[0].url,
    );
    expect(url.origin + url.pathname).toBe(
      "https://teams.microsoft.com/l/entity/app-1/kaneo-home",
    );
    expect(url.searchParams.get("webUrl")).toBe(card.url);
    expect(
      JSON.parse(url.searchParams.get("context") ?? "{}").subEntityId,
    ).toBe(new URL(card.url).pathname);
  });
});

describe("teamsUnfurlConfigFromEnv", () => {
  it("is off without bot id", () => {
    expect(
      teamsUnfurlConfigFromEnv({
        TEAMS_SSO_TENANT_ID: "t",
        KANEO_CLIENT_URL: "https://x",
      }),
    ).toBeNull();
  });
});

describe("POST /teams/messages", () => {
  let sign: (
    claims: Record<string, unknown>,
    opts?: { iss?: string; aud?: string },
  ) => Promise<string>;
  let app: Hono;
  let signKey: CryptoKey;
  const seen: Array<[string, string]> = [];

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    signKey = privateKey;
    sign = (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k" })
        .setIssuer(opts.iss ?? "https://api.botframework.com")
        .setAudience(opts.aud ?? config.botAppId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    // Fake loader: OID can see TASK; everything else is "no access".
    const load = async (ref: TaskRef, oid: string) => {
      const taskId = "taskId" in ref ? ref.taskId : "";
      seen.push([taskId, oid]);
      return taskId === TASK && oid === OID ? card : null;
    };
    app = new Hono();
    app.post(
      "/teams/messages",
      teamsMessagesHandler(
        config,
        async () => publicKey,
        load,
        async (q, oid) => (q === "box" && oid === OID ? [card, card] : []),
      ),
    );
  });

  const invoke = (over: Record<string, unknown> = {}) => ({
    type: "invoke",
    name: "composeExtension/queryLink",
    serviceUrl: SVC,
    from: { aadObjectId: OID },
    channelId: "msteams",
    channelData: { tenant: { id: config.tenantId } },
    value: {
      url: `https://task.example.com/dashboard/organization/o/board/b/task/${TASK}`,
    },
    ...over,
  });
  const post = (token: string, body: unknown) =>
    app.request("/teams/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const attachments = async (r: Response) =>
    ((await r.json()) as { composeExtension: { attachments: unknown[] } })
      .composeExtension.attachments.length;

  it("returns the card for a signed invoke from our tenant by a user with access", async () => {
    const r = await post(await sign({ serviceurl: SVC }), invoke());
    expect(r.status).toBe(200);
    expect(await attachments(r)).toBe(1);
  });

  it("rejects unsigned, wrong-issuer, wrong-audience and serviceUrl-mismatched calls", async () => {
    expect((await post("garbage", invoke())).status).toBe(401);
    expect(
      (await post(await sign({}, { iss: "https://evil" }), invoke())).status,
    ).toBe(401);
    expect(
      (
        await post(
          await sign({ serviceurl: SVC }, { aud: "other-bot" }),
          invoke(),
        )
      ).status,
    ).toBe(401);
    expect(
      (await post(await sign({ serviceurl: "https://evil/" }), invoke()))
        .status,
    ).toBe(401);
    // serviceurl claim is mandatory, not "checked if present"
    expect((await post(await sign({}), invoke())).status).toBe(401);
  });

  it("answers the search command with the user's matching tasks only", async () => {
    const query = (q: string, over: Record<string, unknown> = {}) =>
      invoke({
        name: "composeExtension/query",
        value: {
          commandId: "searchTasks",
          parameters: [{ name: "q", value: q }],
        },
        ...over,
      });
    const tok = await sign({ serviceurl: SVC });
    expect(await attachments(await post(tok, query("box")))).toBe(2);
    expect(await attachments(await post(tok, query("nothing")))).toBe(0);
    expect(
      await attachments(
        await post(
          tok,
          query("box", { channelData: { tenant: { id: "other" } } }),
        ),
      ),
    ).toBe(0);
    expect((await post("bad", query("box"))).status).toBe(401);
  });

  it("rejects a token without exp even when everything else matches", async () => {
    const noExp = await new SignJWT({ serviceurl: SVC })
      .setProtectedHeader({ alg: "RS256", kid: "k" })
      .setIssuer("https://api.botframework.com")
      .setAudience(config.botAppId)
      .sign(signKey);
    expect((await post(noExp, invoke())).status).toBe(401);
  });

  it("refuses any channel other than Teams", async () => {
    const r = await post(
      await sign({ serviceurl: SVC }),
      invoke({ channelId: "directline" }),
    );
    expect(r.status).toBe(401);
  });

  it("returns no card for a foreign tenant, a user without access, or a foreign link", async () => {
    const t = await sign({ serviceurl: SVC });
    expect(
      await attachments(
        await post(t, invoke({ channelData: { tenant: { id: "other" } } })),
      ),
    ).toBe(0);
    expect(
      await attachments(
        await post(
          t,
          invoke({
            from: { aadObjectId: "99999999-2222-3333-4444-555555555555" },
          }),
        ),
      ),
    ).toBe(0);
    expect(
      await attachments(
        await post(
          t,
          invoke({ value: { url: `https://evil.example.com/task/${TASK}` } }),
        ),
      ),
    ).toBe(0);
  });
});

describe("loadCardTask (access gate)", () => {
  const task = {
    id: TASK,
    boardId: "b1",
    number: 7,
    title: "Secret plan",
    status: "to-do",
    priority: "high",
    description: "DO NOT LEAK",
    assignee: { name: "Ann" },
    board: { slug: "it", name: "IT", organizationId: "org1" },
  };

  it("returns fields for a linked Teams user with view access, no description", async () => {
    Object.assign(dbm, { link: [{ userId: "u1" }], task, privilege: "view" });
    const t = await loadCardTask({ taskId: TASK }, OID, config.clientUrl);
    expect(t?.key).toBe("IT-7");
    expect(t?.assignee).toBe("Ann");
    expect(JSON.stringify(t)).not.toContain("DO NOT LEAK");
  });

  it("returns null without board view access or without a Teams-linked account", async () => {
    Object.assign(dbm, { link: [{ userId: "u1" }], task, privilege: "none" });
    expect(
      await loadCardTask({ taskId: TASK }, OID, config.clientUrl),
    ).toBeNull();
    Object.assign(dbm, { link: [], task, privilege: "manage" });
    expect(
      await loadCardTask({ taskId: TASK }, OID, config.clientUrl),
    ).toBeNull();
  });

  it("search returns viewable cards only, nothing for unlinked users", async () => {
    Object.assign(dbm, { link: [{ userId: "u1" }], task, privilege: "view" });
    expect(
      (await searchCardTasks("box", OID, config.clientUrl)).map((t) => t.key),
    ).toEqual(["IT-7"]);
    expect(await searchCardTasks("zzz", OID, config.clientUrl)).toEqual([]);
    Object.assign(dbm, { privilege: "none" });
    expect(await searchCardTasks("box", OID, config.clientUrl)).toEqual([]);
    Object.assign(dbm, { link: [], privilege: "manage" });
    expect(await searchCardTasks("box", OID, config.clientUrl)).toEqual([]);
  });

  it("resolves a short ticket key and still enforces board access", async () => {
    Object.assign(dbm, { link: [{ userId: "u1" }], task, privilege: "view" });
    const ref = { org: "noovoleum", key: "ENG-2" };
    expect((await loadCardTask(ref, OID, config.clientUrl))?.key).toBe("IT-7");
    expect(
      await loadCardTask(
        { org: "noovoleum", key: "NOPE-1" },
        OID,
        config.clientUrl,
      ),
    ).toBeNull();
    Object.assign(dbm, { privilege: "none" });
    expect(await loadCardTask(ref, OID, config.clientUrl)).toBeNull();
  });
});

describe("teamsEndorsedKeys", () => {
  it("resolves only keys endorsed for msteams", async () => {
    const { publicKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    const resolver = teamsEndorsedKeys(async () => [
      { ...jwk, kid: "teams", endorsements: ["msteams", "webchat"] },
      { ...jwk, kid: "webchat", endorsements: ["webchat", "directline"] },
    ]);
    const hdr = (kid: string) => ({ alg: "RS256", kid });
    await expect(resolver(hdr("teams"), {} as never)).resolves.toBeTruthy();
    await expect(resolver(hdr("webchat"), {} as never)).rejects.toThrow();
    await expect(resolver(hdr("unknown"), {} as never)).rejects.toThrow();
  });
});

describe("loadCardTask (banned)", () => {
  it("returns null for a banned user even with access", async () => {
    Object.assign(dbm, {
      link: [{ userId: "u1", banned: true }],
      task: {
        id: TASK,
        boardId: "b1",
        number: 1,
        title: "t",
        status: "s",
        priority: null,
        assignee: null,
        board: { slug: "it", name: "IT", organizationId: "o" },
      },
      privilege: "manage",
    });
    expect(
      await loadCardTask({ taskId: TASK }, OID, config.clientUrl),
    ).toBeNull();
  });
});
