import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockVerifyApiKey = vi.fn();

vi.mock("../../../apps/api/src/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));

vi.mock("../../../apps/api/src/utils/verify-api-key", () => ({
  verifyApiKey: (...a: unknown[]) => mockVerifyApiKey(...a),
}));

/**
 * Agents must be able to authorize against /api/mcp so they can discover the
 * actions available to them.
 *
 * `/api/mcp` is deliberately excluded from the global `authenticateApiRequest`
 * middleware (it runs its own OAuth consent flow), and MCP's own resolver only
 * called `auth.api.getSession`, which cannot resolve API keys. Agents authenticate
 * with a `kaneo_agent_*` API key, so every agent request 401'd — an agent could
 * not even list tools.
 *
 * These import the REAL resolver from apps/api/src/mcp/index.ts, so they fail if
 * that logic regresses. Authorization is unchanged: the resolved userId keys the
 * same permission guards (#38).
 */

import { validateBearerToken } from "../../../apps/api/src/mcp/index";

const AGENT_KEY = "kaneo_agent_abc123";
const AGENT_USER = "agent-user-1";

function req(headers: Record<string, string>) {
  return new Request("http://localhost:1337/api/mcp", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(null);
  mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });
});

describe("agent access to /api/mcp", () => {
  it("resolves an agent key sent as x-api-key", async () => {
    mockVerifyApiKey.mockImplementation(async (candidate: string) =>
      candidate === AGENT_KEY
        ? { valid: true, key: { id: "key-1", userId: AGENT_USER } }
        : { valid: false, key: null },
    );

    const result = await validateBearerToken(req({ "x-api-key": AGENT_KEY }));

    expect(result).toEqual({ userId: AGENT_USER, token: AGENT_KEY });
  });

  it("resolves an agent key sent as a bearer token", async () => {
    mockVerifyApiKey.mockImplementation(async (candidate: string) =>
      candidate === AGENT_KEY
        ? { valid: true, key: { id: "key-1", userId: AGENT_USER } }
        : { valid: false, key: null },
    );

    const result = await validateBearerToken(
      req({ authorization: `Bearer ${AGENT_KEY}` }),
    );

    expect(result).toEqual({ userId: AGENT_USER, token: AGENT_KEY });
  });

  it("tries the key path before getSession, which cannot resolve keys", async () => {
    /*
      Ordering matters: getSession rejects API keys, so consulting it first (the
      old behaviour) returned null and produced the 401.
    */
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key-1", userId: AGENT_USER },
    });

    await validateBearerToken(req({ "x-api-key": AGENT_KEY }));

    expect(mockVerifyApiKey).toHaveBeenCalledWith(AGENT_KEY);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("returns the agent's own userId so permission guards still apply", async () => {
    mockVerifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key-1", userId: AGENT_USER },
    });

    const result = await validateBearerToken(req({ "x-api-key": AGENT_KEY }));

    // the userId keys assertBoardPermission/assertTaskPermission (#38): opening
    // access must not mean bypassing authorization
    expect(result?.userId).toBe(AGENT_USER);
  });
});

describe("human access is unchanged", () => {
  it("still resolves a session bearer token", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "human-1" } });

    const result = await validateBearerToken(
      req({ authorization: "Bearer session-token" }),
    );

    expect(result).toEqual({ userId: "human-1", token: "session-token" });
  });
});

describe("invalid callers are still rejected", () => {
  it("rejects a request with no credentials", async () => {
    expect(await validateBearerToken(req({}))).toBeNull();
  });

  it("rejects a malformed authorization header", async () => {
    expect(
      await validateBearerToken(req({ authorization: "Bearer" })),
    ).toBeNull();
  });

  it("rejects an unknown api key", async () => {
    expect(
      await validateBearerToken(req({ "x-api-key": "kaneo_agent_bogus" })),
    ).toBeNull();
  });

  it("rejects a revoked key even when the header is well formed", async () => {
    mockVerifyApiKey.mockResolvedValue({ valid: false, key: null });

    expect(
      await validateBearerToken(req({ authorization: `Bearer ${AGENT_KEY}` })),
    ).toBeNull();
  });
});
