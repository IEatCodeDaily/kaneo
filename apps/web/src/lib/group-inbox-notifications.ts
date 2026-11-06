import type { Notification } from "@/types/notification";

/** A flagged notification is a raised flag: it can't be marked read; the user
 *  must open the ticket and unflag it. Resolved flags behave like normal reads. */
export function isFlaggedNotification(notification: Notification): boolean {
  return notification.type === "task_flag_raised";
}

export type InboxTicketGroup = {
  key: string;
  title: string;
  number: number | null;
  statusSlug: string | null;
  statusName: string | null;
  statusIcon: string | null;
  statusIsFinal: boolean;
  flaggedCount: number;
  notifications: Notification[];
};

export type InboxBoardGroup = {
  key: string;
  name: string;
  unreadCount: number;
  flaggedCount: number;
  tickets: InboxTicketGroup[];
};

export type InboxTimeTicket = InboxTicketGroup & {
  unread: boolean;
  boardName: string;
  boardSlug: string | null;
  organizationId: string | null;
};

export function groupInboxByTime(
  notifications: Notification[],
  now = new Date(),
) {
  const tickets = new Map<string, InboxTimeTicket>();
  for (const notification of [...notifications].sort(
    (a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)),
  )) {
    const data = dataOf(notification);
    const org =
      typeof data.organizationId === "string" ? data.organizationId : null;
    const key = `${org ?? ""}:${String(data.boardId ?? "")}:${notification.resourceType === "task" ? notification.resourceId : notification.id}`;
    let ticket = tickets.get(key);
    if (!ticket) {
      const base = groupInboxNotifications([notification])[0].tickets[0];
      ticket = {
        ...base,
        key,
        notifications: [],
        flaggedCount: 0,
        unread: false,
        boardName: String(data.boardName ?? ""),
        boardSlug: typeof data.boardSlug === "string" ? data.boardSlug : null,
        organizationId: org,
      };
      tickets.set(key, ticket);
    }
    ticket.notifications.push(notification);
    if (isFlaggedNotification(notification)) ticket.flaggedCount++;
    else if (!notification.isRead) ticket.unread = true;
  }
  const groups = new Map<string, InboxTimeTicket[]>();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  for (const ticket of tickets.values()) {
    const date = new Date(ticket.notifications[0].createdAt);
    const name = ticket.flaggedCount
      ? "flagged"
      : date >= today
        ? "today"
        : date >= yesterday
          ? "yesterday"
          : "earlier";
    groups.set(name, [...(groups.get(name) ?? []), ticket]);
  }
  return ["flagged", "today", "yesterday", "earlier"]
    .filter((name) => groups.has(name))
    .map((name) => ({ name, tickets: groups.get(name) ?? [] }));
}

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
    const flagged = isFlaggedNotification(notification);
    const boardId = typeof data.boardId === "string" ? data.boardId : "other";
    const board = boards.get(boardId) ?? {
      key: boardId,
      name: typeof data.boardName === "string" ? data.boardName : "Other",
      unreadCount: 0,
      flaggedCount: 0,
      tickets: [],
      ticketsByKey: new Map(),
    };
    // A raised flag is a standing alert, not an "unread" item: it stays until
    // the ticket is unflagged, so it feeds the flagged counter, not unread.
    if (flagged) board.flaggedCount += 1;
    else if (!notification.isRead) board.unreadCount += 1;

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
      statusSlug: typeof data.taskStatus === "string" ? data.taskStatus : null,
      statusName:
        typeof data.taskStatusName === "string" ? data.taskStatusName : null,
      statusIcon:
        typeof data.taskStatusIcon === "string" ? data.taskStatusIcon : null,
      statusIsFinal: data.taskStatusIsFinal === true,
      flaggedCount: 0,
      notifications: [],
    };
    // A later notification carries the freshest status for the same ticket.
    if (typeof data.taskStatus === "string")
      ticket.statusSlug = data.taskStatus;
    if (typeof data.taskStatusName === "string")
      ticket.statusName = data.taskStatusName;
    if (typeof data.taskStatusIcon === "string")
      ticket.statusIcon = data.taskStatusIcon;
    if (typeof data.taskStatusIsFinal === "boolean")
      ticket.statusIsFinal = data.taskStatusIsFinal;
    if (flagged) ticket.flaggedCount += 1;
    ticket.notifications.push(notification);
    board.ticketsByKey.set(taskKey, ticket);
    if (!boards.has(boardId)) boards.set(boardId, board);
  }

  return [...boards.values()].map(({ ticketsByKey, ...board }) => ({
    ...board,
    tickets: [...ticketsByKey.values()],
  }));
}
