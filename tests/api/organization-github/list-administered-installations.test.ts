import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, paginate, getUsableDelegatedToken, Octokit } = vi.hoisted(
  () => ({
    select: vi.fn(),
    paginate: vi.fn(),
    getUsableDelegatedToken: vi.fn(),
    Octokit: vi.fn(),
  }),
);

vi.mock("../../../apps/api/src/database", () => ({ default: { select } }));
vi.mock("../../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: () => ({
    octokit: {
      paginate,
      rest: { apps: { listInstallations: vi.fn() } },
    },
  }),
}));
vi.mock("../../../apps/api/src/github-delegation", () => ({
  getUsableDelegatedToken,
}));
vi.mock("octokit", () => ({ Octokit }));

import { listAdministeredInstallations } from "../../../apps/api/src/organization-github/controllers/list-administered-installations";

describe("listAdministeredInstallations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsableDelegatedToken.mockResolvedValue("refreshed-token");
    Octokit.mockImplementation(() => ({}));
    select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              accessToken: "token",
              githubLogin: "admin",
            },
          ],
        }),
      }),
    });
    paginate.mockResolvedValue([
      {
        id: 42,
        account: { id: 7, login: "admin", type: "User" },
      },
    ]);
  });

  it("offers an administered installation independently to each Kaneo organization", async () => {
    const first = await listAdministeredInstallations({
      organizationId: "kaneo-org-1",
      userId: "user-1",
    });
    const second = await listAdministeredInstallations({
      organizationId: "kaneo-org-2",
      userId: "user-1",
    });

    expect(first.map(({ id }) => id)).toEqual([42]);
    expect(second.map(({ id }) => id)).toEqual([42]);
    expect(select).toHaveBeenCalledTimes(2);
    expect(getUsableDelegatedToken).toHaveBeenCalledTimes(2);
    expect(Octokit).toHaveBeenCalledWith({ auth: "refreshed-token" });
  });
});
