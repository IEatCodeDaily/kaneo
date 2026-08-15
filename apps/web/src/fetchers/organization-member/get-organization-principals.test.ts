import { afterEach, describe, expect, it, vi } from "vitest";
import getOrganizationPrincipals from "@/fetchers/organization-member/get-organization-principals";

/**
 * KFL-160: the picker needs an explicit `kind` per principal. Better Auth's
 * listMembers strips `user.role`, so the client must read the dedicated
 * /organization/:organizationId/principals endpoint instead.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn().mockResolvedValue(response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getOrganizationPrincipals (KFL-160)", () => {
  it("requests the organization's principals endpoint with credentials", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => [] });

    await getOrganizationPrincipals("org 1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/organization/org%201/principals");
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("returns the principals with their kind discriminator intact", async () => {
    stubFetch({
      ok: true,
      json: async () => [
        {
          id: "u1",
          name: "Ada",
          email: "ada@example.com",
          image: null,
          kind: "user",
        },
        {
          id: "a1",
          name: "Codex",
          email: "codex@example.com",
          image: null,
          kind: "agent",
        },
      ],
    });

    const principals = await getOrganizationPrincipals("org-1");

    expect(principals.map((p) => [p.id, p.kind])).toEqual([
      ["u1", "user"],
      ["a1", "agent"],
    ]);
  });

  it("throws when the endpoint fails", async () => {
    stubFetch({ ok: false, text: async () => "boom" });

    await expect(getOrganizationPrincipals("org-1")).rejects.toThrow("boom");
  });
});
