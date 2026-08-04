import { describe, expect, it } from "vitest";
import type { Notification } from "@/types/notification";
import { groupInboxNotifications } from "./group-inbox-notifications";

const notification = (
  id: string,
  boardId: string,
  taskId: string,
  isRead = false,
  taskStatusName?: string,
  type = "task_updated",
) =>
  ({
    id,
    resourceId: taskId,
    resourceType: "task",
    isRead,
    title: "Changed",
    type,
    createdAt: `2026-08-04T00:00:0${id}.000Z`,
    eventData: {
      boardId,
      boardName: `Board ${boardId}`,
      taskTitle: `Ticket ${taskId}`,
      taskNumber: Number(taskId),
      ...(taskStatusName ? { taskStatusName } : {}),
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

  it("carries the ticket's latest status onto its group", () => {
    const groups = groupInboxNotifications([
      notification("1", "a", "1", false, "To Do"),
      notification("2", "a", "1", false, "In Progress"),
    ]);

    // Latest notification (id 2) reflects the current column.
    expect(groups[0].tickets[0].statusName).toBe("In Progress");
  });

  it("counts flags separately from unread and never as unread", () => {
    const groups = groupInboxNotifications([
      // one plain unread, one raised flag on the same ticket
      notification("1", "a", "1", false),
      notification("2", "a", "1", false, undefined, "task_flag_raised"),
    ]);

    // The flag is a standing alert: 1 unread, 1 flagged, not 2 unread.
    expect(groups[0].unreadCount).toBe(1);
    expect(groups[0].flaggedCount).toBe(1);
    expect(groups[0].tickets[0].flaggedCount).toBe(1);
  });
});
