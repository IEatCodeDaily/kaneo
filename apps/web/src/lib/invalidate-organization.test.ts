import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { $store: { notify: mocks.notify } },
}));

import type { QueryClient } from "@tanstack/react-query";
import invalidateOrganizationQueries from "./invalidate-organization";

describe("invalidateOrganizationQueries", () => {
  it("fires both better-auth org signals and drops the legacy react-query keys", async () => {
    await invalidateOrganizationQueries({
      invalidateQueries: mocks.invalidate,
    } as unknown as QueryClient);

    // Better Auth's hooks are nanostore-backed: without these two signals
    // nothing refetches the org rows and the logo stays stale everywhere.
    expect(mocks.notify).toHaveBeenCalledWith("$listOrg");
    expect(mocks.notify).toHaveBeenCalledWith("$activeOrgSignal");
    expect(
      mocks.invalidate.mock.calls.map(
        (call) => (call[0] as { queryKey: string[] }).queryKey,
      ),
    ).toEqual([["organizations"], ["active-organization"]]);
  });
});
