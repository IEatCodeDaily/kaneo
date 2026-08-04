import type { Notification } from "@/types/notification";

export type InboxTicketGroup = {
  key: string;
  title: string;
  number: number | null;
  statusName: string | null;
  notifications: Notification[];
};

export type InboxBoardGroup = {
  key: string;
  name: string;
  unreadCount: number;
  tickets: InboxTicketGroup[];
};

function dataOf(notification: Notification) {
  const data = notification.eventData;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function groupInboxNotifications(
  notifications: Notification[],
): InboxBoardGroup[] {
  const boards = new Map<
    string,
    InboxBoardGroup & { ticketsByKey: Map<string, InboxTicketGroup> }
  >();

  for (const notification of notifications) {
    const data = dataOf(notification);
    const boardId = typeof data.boardId === "string" ? data.boardId : "other";
    const board = boards.get(boardId) ?? {
      key: boardId,
      name: typeof data.boardName === "string" ? data.boardName : "Other",
      unreadCount: 0,
      tickets: [],
      ticketsByKey: new Map(),
    };
    if (!notification.isRead) board.unreadCount += 1;

    const taskKey =
      notification.resourceType === "task" && notification.resourceId
        ? notification.resourceId
        : notification.id;
    const ticket = board.ticketsByKey.get(taskKey) ?? {
      key: taskKey,
      title:
        typeof data.taskTitle === "string"
          ? data.taskTitle
          : (notification.title ?? notification.type),
      number: typeof data.taskNumber === "number" ? data.taskNumber : null,
      statusName:
        typeof data.taskStatusName === "string" ? data.taskStatusName : null,
      notifications: [],
    };
    // A later notification carries the freshest status for the same ticket.
    if (typeof data.taskStatusName === "string") {
      ticket.statusName = data.taskStatusName;
    }
    ticket.notifications.push(notification);
    board.ticketsByKey.set(taskKey, ticket);
    if (!boards.has(boardId)) boards.set(boardId, board);
  }

  return [...boards.values()].map(({ ticketsByKey, ...board }) => ({
    ...board,
    tickets: [...ticketsByKey.values()],
  }));
}
