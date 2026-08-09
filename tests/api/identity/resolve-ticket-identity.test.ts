import { describe, expect, it, vi } from "vitest";
import {
  resolveTicketIdentity,
  type TicketIdentityRepository,
} from "../../../apps/api/src/identity/resolve-ticket-identity";

function repository(
  overrides: Partial<TicketIdentityRepository> = {},
): TicketIdentityRepository {
  return {
    findOrganization: vi.fn().mockResolvedValue({
      id: "org-1",
      slug: "nevrlabs",
      alias: false,
    }),
    findBoard: vi.fn().mockResolvedValue({
      id: "board-1",
      slug: "KFL",
      alias: false,
    }),
    findTicketByNumber: vi.fn().mockResolvedValue({
      id: "ticket-1",
      title: "Identity",
      number: 270,
      boardId: "board-1",
    }),
    findTicketById: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("resolveTicketIdentity", () => {
  it("resolves a current human-readable ticket key", async () => {
    const result = await resolveTicketIdentity(
      "NevrLabs",
      "kfl-270",
      repository(),
    );
    expect(result).toMatchObject({
      ticketId: "ticket-1",
      ticketKey: "KFL-270",
      organization: { id: "org-1", slug: "nevrlabs" },
      board: { id: "board-1", key: "KFL" },
      resolution: {
        usedOrganizationAlias: false,
        usedBoardAlias: false,
        usedLegacyId: false,
      },
    });
  });

  it("reports organization and board alias resolution", async () => {
    const result = await resolveTicketIdentity(
      "old-org",
      "OLD-KFL-270",
      repository({
        findOrganization: vi.fn().mockResolvedValue({
          id: "org-1",
          slug: "nevrlabs",
          alias: true,
        }),
        findBoard: vi.fn().mockResolvedValue({
          id: "board-1",
          slug: "KFL",
          alias: true,
        }),
      }),
    );
    expect(result?.ticketKey).toBe("KFL-270");
    expect(result?.resolution).toEqual({
      usedOrganizationAlias: true,
      usedBoardAlias: true,
      usedLegacyId: false,
    });
  });

  it("falls back to an opaque ticket ID within the organization", async () => {
    const result = await resolveTicketIdentity(
      "nevrlabs",
      "ticket-uuid",
      repository({
        findTicketById: vi.fn().mockResolvedValue({
          id: "ticket-uuid",
          title: "Legacy",
          number: 12,
          boardId: "board-2",
          boardSlug: "OPS",
        }),
      }),
    );
    expect(result).toMatchObject({
      ticketId: "ticket-uuid",
      ticketKey: "OPS-12",
      resolution: { usedLegacyId: true },
    });
  });

  it.each([
    { findOrganization: vi.fn().mockResolvedValue(null) },
    { findBoard: vi.fn().mockResolvedValue(null) },
    { findTicketByNumber: vi.fn().mockResolvedValue(null) },
  ])("returns null when any scoped identity is missing", async (override) => {
    await expect(
      resolveTicketIdentity("nevrlabs", "KFL-270", repository(override)),
    ).resolves.toBeNull();
  });

  it("returns null when a legacy ID is outside the organization", async () => {
    await expect(
      resolveTicketIdentity("nevrlabs", "ticket-uuid", repository()),
    ).resolves.toBeNull();
  });
});
