import { describe, expect, it } from "vitest";
import {
  type IdentityAliasRepository,
  listIdentityAliases,
} from "../../../apps/api/src/identity/list-identity-aliases";

describe("listIdentityAliases", () => {
  it("groups current organization and board identities with sorted historical aliases", async () => {
    const repository: IdentityAliasRepository = {
      findOrganization: async () => ({ id: "org-1", slug: "nevrlabs" }),
      listOrganizationAliases: async () => ["OLD-NAME", "alpha"],
      listBoards: async () => [
        { id: "board-2", name: "Product", key: "PROD" },
        { id: "board-1", name: "Features", key: "KFL" },
      ],
      listBoardAliases: async () => [
        { boardId: "board-1", key: "KFLTMP" },
        { boardId: "board-1", key: "FEATURE" },
      ],
    };

    await expect(listIdentityAliases("org-1", repository)).resolves.toEqual({
      organization: {
        currentSlug: "nevrlabs",
        aliases: ["alpha", "OLD-NAME"],
      },
      boards: [
        {
          boardId: "board-1",
          boardName: "Features",
          currentKey: "KFL",
          aliases: ["FEATURE", "KFLTMP"],
        },
        {
          boardId: "board-2",
          boardName: "Product",
          currentKey: "PROD",
          aliases: [],
        },
      ],
    });
  });

  it("returns null for a missing organization", async () => {
    const repository: IdentityAliasRepository = {
      findOrganization: async () => null,
      listOrganizationAliases: async () => [],
      listBoards: async () => [],
      listBoardAliases: async () => [],
    };
    await expect(
      listIdentityAliases("missing", repository),
    ).resolves.toBeNull();
  });
});
