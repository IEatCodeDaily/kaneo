import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Claim mapping is a single-org-mode capability. These cases pin the guard
 * itself: in multi-org mode `syncOidcTeams` must not query at all, so the
 * feature is genuinely off rather than partially applied.
 *
 * `getSettings` reads `process.env` when called, so each case sets the mode and
 * re-imports the service against a fresh module registry.
 */
async function loadService(singleOrgMode: boolean) {
  vi.resetModules();
  if (singleOrgMode) process.env.SINGLE_ORG_MODE = "true";
  else delete process.env.SINGLE_ORG_MODE;

  const select = vi.fn(() => ({
    from: () => ({ where: () => Promise.resolve([]) }),
  }));
  vi.doMock("../../apps/api/src/database", () => ({
    default: { select, transaction: vi.fn() },
    schema: {
      organizationMemberTable: { organizationId: {}, userId: {} },
      oidcTeamSyncConfigTable: { organizationId: {} },
      teamTable: { id: {}, organizationId: {}, source: {} },
      teamMemberTable: { teamId: {}, userId: {} },
    },
  }));

  const service = await import("../../apps/api/src/oidc-team-sync/service");
  return { service, select };
}

describe("syncOidcTeams single-org gating", () => {
  beforeEach(() => {
    delete process.env.SINGLE_ORG_MODE;
  });

  it("does not touch the database in multi-org mode", async () => {
    const { service, select } = await loadService(false);

    await service.syncOidcTeams("user-1", { roles: ["admin"] });

    expect(select).not.toHaveBeenCalled();
  });

  it("proceeds to read memberships in single-org mode", async () => {
    const { service, select } = await loadService(true);

    await service.syncOidcTeams("user-1", { roles: ["admin"] });

    expect(select).toHaveBeenCalled();
  });
});
