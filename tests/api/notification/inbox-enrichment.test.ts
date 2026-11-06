import { expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/database", () => {
  const chain: Record<string, unknown> = {};
  for (const name of [
    "select",
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "as",
  ])
    chain[name] = () => chain;
  chain.limit = async () => [
    {
      notification: { id: "n1", eventData: {} },
      boardId: "b1",
      boardName: "Board",
      boardSlug: "KFL",
      taskNumber: 384,
      taskTitle: "Ticket",
      organizationId: "org",
    },
  ];
  return { default: chain };
});

import getNotifications from "../../../apps/api/src/notification/controllers/get-notifications";

it("enriches notifications with the live ticket key and title", async () => {
  const [n] = await getNotifications("user");
  expect(n.eventData).toMatchObject({
    boardSlug: "KFL",
    taskNumber: 384,
    taskTitle: "Ticket",
  });
});
