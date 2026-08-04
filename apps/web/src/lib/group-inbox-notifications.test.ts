import { describe, expect, it } from "vitest";
import type { Notification } from "@/types/notification";
import { groupInboxNotifications } from "./group-inbox-notifications";

const notification = (
  id: string,
  boardId: string,
  taskId: string,
  isRead = false,
) =>
  ({
    id,
    resourceId: taskId,
    resourceType: "task",
    isRead,
    title: "Changed",
    type: "task_updated",
    createdAt: `2026-08-04T00:00:0${id}.000Z`,
    eventData: {
      boardId,
      boardName: `Board ${boardId}`,
      taskTitle: `Ticket ${taskId}`,
      taskNumber: Number(taskId),
    },
  }) as Notification;

describe("groupInboxNotifications", () => {
  it("groups events by board and ticket while preserving order", () => {
    const groups = groupInboxNotifications([
      notification("1", "a", "1"),
      notification("2", "a", "1", true),
      notification("3", "a", "2"),
      notification("4", "b", "3"),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Board a", "Board b"]);
    expect(groups[0].tickets.map((ticket) => ticket.title)).toEqual([
      "Ticket 1",
      "Ticket 2",
    ]);
    expect(groups[0].tickets[0].notifications).toHaveLength(2);
    expect(groups[0].unreadCount).toBe(2);
  });
});
