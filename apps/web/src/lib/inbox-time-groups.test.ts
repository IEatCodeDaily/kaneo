import { expect, it } from "vitest";
import { groupInboxByTime } from "./group-inbox-notifications";

it("pins flagged tickets once while preserving unread comments and organization boundaries", () => {
  const make = (id: string, org: string, type: string, read: boolean) => ({
    id,
    type,
    isRead: read,
    resourceId: "same",
    resourceType: "task",
    title: id,
    createdAt: "2026-11-05T09:00:00Z",
    eventData: { boardId: "board", organizationId: org, taskTitle: "Ticket" },
  });
  const groups = groupInboxByTime(
    [
      make("flag", "a", "task_flag_raised", false),
      make("comment", "a", "task_comment", false),
      make("other", "b", "task_comment", false),
    ] as never,
    new Date("2026-11-05T12:00:00Z"),
  );
  expect(groups[0].name).toBe("flagged");
  expect(groups[0].tickets).toHaveLength(1);
  expect(groups[0].tickets[0].notifications).toHaveLength(2);
  expect(groups[0].tickets[0].unread).toBe(true);
  expect(groups[1].tickets).toHaveLength(1);
});
