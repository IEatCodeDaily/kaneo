import { Check, Flag, Mail, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { formatDate, formatRelativeTime } from "@/lib/format";
import {
  groupInboxByTime,
  isFlaggedNotification,
} from "@/lib/group-inbox-notifications";
import type { Notification } from "@/types/notification";
import { getNotificationTitle } from "./notification-dropdown";

type Props = {
  notifications: Notification[];
  selectedTaskId?: string;
  organizationId: string;
  onSelect: (notification: Notification) => void;
  onRead: (id: string) => void;
  onUnread: (id: string) => void;
  onDismiss: (ids: string[]) => void;
};
export default function InboxTicketList({
  notifications,
  selectedTaskId,
  organizationId,
  onSelect,
  onRead,
  onUnread,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border/50">
      {groupInboxByTime(notifications).map((group) => (
        <section key={group.name}>
          <h2 className="sticky top-0 z-10 flex items-center gap-2 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`inbox:groups.${group.name}`)}
            <span>{group.tickets.length}</span>
          </h2>
          {group.tickets.map((ticket) => {
            const head = ticket.notifications[0];
            const flag = ticket.notifications.find(isFlaggedNotification);
            const data = flag?.eventData as Record<string, unknown> | undefined;
            const color =
              typeof data?.flagTypeColor === "string"
                ? data.flagTypeColor
                : undefined;
            const actorName = (
              head.eventData as Record<string, unknown> | undefined
            )?.actorName;
            const normal = ticket.notifications.filter(
              (n) => !isFlaggedNotification(n),
            );
            const selected = selectedTaskId === head.resourceId;
            const time =
              group.name === "today" || group.name === "yesterday"
                ? formatDate(head.createdAt, {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : formatRelativeTime(head.createdAt);
            return (
              <div
                key={ticket.key}
                // Selection is an inset ring: the flag's inline tint and stripe
                // cannot override it, so a selected flagged row still reads as
                // selected.
                className={cn(
                  "group flex min-h-16 items-center border-l-2 border-transparent pr-1 sm:pr-2",
                  selected &&
                    "bg-accent border-l-foreground ring-1 ring-ring ring-inset",
                )}
                style={
                  flag
                    ? {
                        borderLeftColor: color ?? "var(--destructive)",
                        backgroundColor: color ? `${color}0c` : undefined,
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  data-notification-id={head.id}
                  aria-label={ticket.title}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    normal
                      .filter((n) => !n.isRead)
                      .forEach((n) => {
                        onRead(n.id);
                      });
                    onSelect(head);
                  }}
                  className="flex min-h-16 min-w-0 flex-1 items-start gap-2 py-3 pr-1 pl-3 text-left hover:bg-muted/40 sm:gap-3 sm:px-3"
                  onKeyDown={(event) => {
                    if (event.key.toLowerCase() === "u" && !flag) {
                      event.preventDefault();
                      event.stopPropagation();
                      normal.forEach((n) => {
                        if (ticket.unread) onRead(n.id);
                        else onUnread(n.id);
                      });
                    }
                    if (
                      (event.key === "Delete" ||
                        event.key.toLowerCase() === "e") &&
                      !flag
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      onDismiss(normal.map((n) => n.id));
                    }
                  }}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      ticket.unread ? "bg-info" : "bg-transparent",
                    )}
                  />
                  {/* Phones: title spans the full width; the timestamp drops
                      to the meta line's row (grid row 2, right column). */}
                  <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-2 sm:flex sm:items-start">
                    <span className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
                      <span className="col-span-2 flex min-w-0 items-center gap-2 text-sm font-medium">
                        {flag ? (
                          <Flag
                            className="size-3.5 shrink-0"
                            style={{ color }}
                          />
                        ) : (
                          getColumnIcon(
                            ticket.statusSlug ?? "",
                            ticket.statusIsFinal,
                            ticket.statusIcon,
                          )
                        )}
                        <span className="truncate">{ticket.title}</span>
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="shrink-0 font-mono">
                          {ticket.number != null
                            ? `${ticket.boardSlug ? `${ticket.boardSlug}-` : "#"}${ticket.number}`
                            : ticket.boardName}
                        </span>
                        {typeof actorName === "string" && actorName && (
                          <span className="max-w-24 shrink-0 truncate">
                            {actorName}
                          </span>
                        )}
                        <span className="min-w-0 truncate">
                          {getNotificationTitle(head, t)}
                        </span>
                        {ticket.notifications.length > 1 && (
                          <span className="shrink-0 rounded-sm bg-muted px-1.5">
                            +{ticket.notifications.length - 1}
                          </span>
                        )}
                        {ticket.organizationId &&
                          ticket.organizationId !== organizationId && (
                            <span className="shrink-0 rounded-sm border px-1">
                              {t("inbox:otherOrganization")}
                            </span>
                          )}
                      </span>
                    </span>
                    <span className="col-start-2 row-start-2 mt-1 shrink-0 self-start text-muted-foreground text-xs tabular-nums sm:mt-0 sm:self-center">
                      {time}
                    </span>
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={Boolean(flag)}
                  aria-label={t(
                    ticket.unread ? "inbox:markRead" : "inbox:markUnread",
                  )}
                  title={t(
                    ticket.unread ? "inbox:markRead" : "inbox:markUnread",
                  )}
                  onClick={() =>
                    normal.forEach((n) => {
                      if (ticket.unread) onRead(n.id);
                      else onUnread(n.id);
                    })
                  }
                  className="size-11 shrink-0 sm:size-8"
                >
                  {ticket.unread ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={Boolean(flag)}
                  aria-label={t("inbox:dismiss")}
                  onClick={() => onDismiss(normal.map((n) => n.id))}
                  className="size-11 shrink-0 sm:size-8"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
