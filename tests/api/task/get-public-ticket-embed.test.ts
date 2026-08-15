import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      taskTable: {
        findFirst: mocks.findFirst,
      },
    },
  },
}));

import getPublicTicketEmbed from "../../../apps/api/src/task/controllers/get-public-ticket-embed";

const ticket = {
  id: "task-secret-internal-id",
  number: 177,
  title: "Ticket Embed Feature",
  description: "must never be exposed",
  board: {
    id: "board-secret-internal-id",
    slug: "kfl",
    isPublic: true,
    organization: {
      id: "org-secret-internal-id",
      name: "Kaneo",
    },
  },
};

describe("getPublicTicketEmbed", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
  });

  it("returns only the canonical ticket key, title, and organization name", async () => {
    mocks.findFirst.mockResolvedValue(ticket);

    await expect(
      getPublicTicketEmbed("task-secret-internal-id"),
    ).resolves.toEqual({
      ticketKey: "KFL-177",
      title: "Ticket Embed Feature",
      organizationName: "Kaneo",
    });
  });

  it("rejects a ticket on a non-public board", async () => {
    mocks.findFirst.mockResolvedValue({
      ...ticket,
      board: { ...ticket.board, isPublic: false },
    });

    await expect(
      getPublicTicketEmbed("task-secret-internal-id"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("leaks no field beyond the three public ones", async () => {
    /*
			The whole risk of an unauthenticated endpoint is over-serialisation.
			Asserting the exact key SET (not just the three values) means adding a
			field to the controller's return without thinking fails here, rather
			than silently publishing a description or an internal id.
		*/
    mocks.findFirst.mockResolvedValue(ticket);

    const result = await getPublicTicketEmbed("task-secret-internal-id");

    expect(Object.keys(result).sort()).toEqual([
      "organizationName",
      "ticketKey",
      "title",
    ]);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("secret-internal-id");
    expect(serialised).not.toContain("must never be exposed");
  });

  it("returns 404 for an unknown ticket", async () => {
    mocks.findFirst.mockResolvedValue(undefined);

    await expect(getPublicTicketEmbed("missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});
