import { describe, expect, it } from "vitest";
import type { Notification } from "@/types/notification";
import {
  getNotificationContent,
  getNotificationTitle,
  groupNotifications,
} from "./notification-dropdown";

const t = (
  key: string,
  options?: Record<string, number | string | undefined>,
) => {
  if (key === "notifications:reminderLeadTime.days") {
    return `${options?.count} days`;
  }
  if (key === "notifications:events.due_date_reminder.content") {
    return `${options?.taskTitle} is due in ${options?.leadTime}`;
  }
  if (key === "notifications:events.task_comment.title") {
    return `${options?.commenterName} commented on your task`;
  }
  if (key === "notifications:events.task_comment.content") {
    return `New comment on ${options?.taskTitle}: ${options?.commentPreview}`;
  }
  return key;
};

function notification(
  type: string,
  eventData: Record<string, unknown>,
): Notification {
  return {
    id: "notification-1",
    userId: "user-1",
    title: null,
    content: null,
    type,
    eventData,
    isRead: false,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  } as unknown as Notification;
}

describe("groupNotifications", () => {
  const groupedNotification = (
    id: string,
    resourceType: string,
    resourceId: string | null,
    createdAt: string,
    isRead = false,
  ) =>
    ({
      ...notification("task_comment", { taskTitle: `Ticket ${resourceId}` }),
      id,
      resourceType,
      resourceId,
      createdAt,
      isRead,
    }) as Notification;

  it("groups events for the same ticket and counts unread events", () => {
    const groups = groupNotifications([
      groupedNotification("a", "task", "one", "2026-01-01T10:00:00Z"),
      groupedNotification("b", "task", "one", "2026-01-02T10:00:00Z", true),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "task:one",
      taskTitle: "Ticket one",
      taskNumber: null,
      unreadCount: 1,
      latestCreatedAt: "2026-01-02T10:00:00Z",
    });
    expect(groups[0].notifications.map(({ id }) => id)).toEqual(["b", "a"]);
  });

  it("keeps different tickets and non-task notifications separate", () => {
    const groups = groupNotifications([
      groupedNotification("a", "task", "one", "2026-01-01T10:00:00Z"),
      groupedNotification("b", "task", "two", "2026-01-03T10:00:00Z"),
      groupedNotification("c", "organization", "org", "2026-01-02T10:00:00Z"),
    ]);
    expect(groups.map(({ key }) => key)).toEqual([
      "task:two",
      "notification:c",
      "task:one",
    ]);
  });

  it("orders groups latest-first regardless of input order", () => {
    const groups = groupNotifications([
      groupedNotification("new", "task", "new", "2026-01-04T10:00:00Z"),
      groupedNotification("old", "task", "old", "2026-01-01T10:00:00Z"),
      groupedNotification("middle", "task", "old", "2026-01-03T10:00:00Z"),
    ]);
    expect(groups.map(({ key }) => key)).toEqual(["task:new", "task:old"]);
  });
});

describe("notification display content", () => {
  it("renders configured due-date lead times", () => {
    const item = notification("due_date_reminder", {
      taskTitle: "Launch website",
      leadTimeMinutes: 2880,
    });

    expect(getNotificationTitle(item, t)).toBe(
      "notifications:events.due_date_reminder.title",
    );
    expect(getNotificationContent(item, t)).toBe(
      "Launch website is due in 2 days",
    );
  });

  it("renders comment notifications with their preview", () => {
    const item = notification("task_comment", {
      taskTitle: "Launch website",
      commenterName: "Mina",
      commentPreview: "Ready for review",
    });

    expect(getNotificationTitle(item, t)).toBe("Mina commented on your task");
    expect(getNotificationContent(item, t)).toBe(
      "New comment on Launch website: Ready for review",
    );
  });

  it("resolves participant change notification translation keys", () => {
    const item = notification("task_flag_raised", {
      taskTitle: "Launch website",
      flagTypeName: "Blocked",
    });

    expect(getNotificationTitle(item, t)).toBe(
      "notifications:events.task_flag_raised.title",
    );
    expect(getNotificationContent(item, t)).toBe(
      "notifications:events.task_flag_raised.content",
    );
  });

  it("resolves generic label change notifications without raw ids", () => {
    const item = notification("task_label_assigned", {
      taskTitle: "Launch website",
    });

    expect(getNotificationTitle(item, t)).toBe(
      "notifications:events.task_label_assigned.title",
    );
    expect(getNotificationContent(item, t)).toBe(
      "notifications:events.task_label_assigned.content",
    );
  });
});
