import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Inbox as InboxIcon,
  LayoutDashboard,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import {
  getNotificationContent,
  getNotificationTitle,
} from "@/components/notification/notification-dropdown";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import useClearNotifications from "@/hooks/mutations/notification/use-clear-notifications";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { groupInboxNotifications } from "@/lib/group-inbox-notifications";
import type { Notification } from "@/types/notification";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/inbox",
)({
  component: InboxComponent,
});

function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }
  return eventData as Record<string, unknown>;
}

/**
 * User Inbox (#58): every update on tasks related to the signed-in user,
 * across boards.
 *
 * The bell dropdown is going away with the sidebar overhaul, so the Inbox is
 * now the full surface: same item rendering (title/content resolution comes
 * from the dropdown module so the two never drift), read/unread affordance,
 * mark-as-read on click, mark-all-read and clear-all.
 */
function InboxComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useGetNotifications();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(
    new Set(),
  );

  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: clearAll } = useClearNotifications();

  const notifications: Notification[] = data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const boardGroups = groupInboxNotifications(notifications);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (!notification.isRead) {
        markAsRead(notification.id);
      }

      const eventData = getEventDataRecord(notification.eventData);
      const organizationId =
        typeof eventData?.organizationId === "string"
          ? eventData.organizationId
          : null;
      const boardId =
        typeof eventData?.boardId === "string" ? eventData.boardId : null;
      const taskId = notification.resourceId ?? null;

      if (
        notification.resourceType === "task" &&
        organizationId &&
        boardId &&
        taskId
      ) {
        navigate({
          to: "/dashboard/organization/$organizationId/board/$boardId/task/$taskId",
          params: { organizationId, boardId, taskId },
        });
      }
    },
    [markAsRead, navigate],
  );

  const handleClearAll = () => {
    clearAll();
    setShowClearDialog(false);
  };

  return (
    <OrganizationLayout title={t("inbox:title")}>
      <PageTitle title={t("inbox:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-medium text-sm">{t("inbox:title")}</h1>
          <span className="text-muted-foreground text-xs">
            {t("inbox:count", { count: notifications.length })}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {unreadCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground text-xs"
                onClick={() => markAllAsRead()}
              >
                {t("common:actions.markAllRead")}
              </Button>
            ) : null}
            {notifications.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground text-xs"
                onClick={() => setShowClearDialog(true)}
              >
                {t("notifications:clearAll")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("inbox:loading")}
            </p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <InboxIcon className="mb-1 size-5 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">
                {t("notifications:emptyTitle")}
              </p>
              <p className="text-muted-foreground/60 text-xs">
                {t("notifications:emptySubtitle")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {boardGroups.map((board) => {
                const collapsed = collapsedBoards.has(board.key);
                return (
                  <section
                    key={board.key}
                    className="overflow-hidden rounded-lg border border-border/80 bg-card"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() =>
                        setCollapsedBoards((current) => {
                          const next = new Set(current);
                          if (next.has(board.key)) next.delete(board.key);
                          else next.add(board.key);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40"
                    >
                      <LayoutDashboard className="size-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{board.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {board.tickets.length} tickets
                      </span>
                      {board.unreadCount > 0 ? (
                        <span className="ml-auto rounded-full bg-info/15 px-1.5 py-0.5 font-medium text-info text-xs">
                          {board.unreadCount} unread
                        </span>
                      ) : (
                        <span className="ml-auto" />
                      )}
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          collapsed && "-rotate-90",
                        )}
                      />
                    </button>

                    {collapsed ? null : (
                      <div className="border-t border-border/70">
                        {board.tickets.map((ticket) => (
                          <div
                            key={ticket.key}
                            className="border-border/60 border-b last:border-b-0"
                          >
                            <div className="bg-muted/20 px-3 py-2 text-sm">
                              <span className="font-medium">
                                {ticket.number ? `#${ticket.number} · ` : ""}
                                {ticket.title}
                              </span>
                              <span className="ml-2 text-muted-foreground text-xs">
                                {ticket.notifications.length} events
                              </span>
                            </div>
                            <ul className="divide-y divide-border/50">
                              {ticket.notifications.map((notification) => {
                                const content = getNotificationContent(
                                  notification,
                                  t,
                                );
                                return (
                                  <li
                                    className="flex items-center"
                                    key={notification.id}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleNotificationClick(notification)
                                      }
                                      className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                                    >
                                      <span
                                        aria-hidden
                                        className={cn(
                                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                                          notification.isRead
                                            ? "bg-transparent"
                                            : "bg-info",
                                        )}
                                      />
                                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span
                                          className={cn(
                                            "truncate",
                                            notification.isRead
                                              ? "text-muted-foreground"
                                              : "font-medium text-foreground",
                                          )}
                                        >
                                          {getNotificationTitle(
                                            notification,
                                            t,
                                          )}
                                        </span>
                                        {content ? (
                                          <span className="truncate text-muted-foreground text-xs">
                                            {content}
                                          </span>
                                        ) : null}
                                      </div>
                                      <span className="shrink-0 text-muted-foreground text-xs">
                                        {formatRelativeTime(
                                          notification.createdAt,
                                        )}
                                      </span>
                                    </button>
                                    {notification.isRead ? null : (
                                      <Button
                                        className="mr-3 shrink-0 gap-1.5 text-xs"
                                        onClick={() =>
                                          markAsRead(notification.id)
                                        }
                                        size="sm"
                                        variant="outline"
                                      >
                                        <Check className="size-3.5" />
                                        {t("inbox:markAsRead")}
                                      </Button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("notifications:clearDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("notifications:clearDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline" size="sm">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose onClick={handleClearAll}>
              <Button variant="destructive" size="sm">
                {t("common:actions.clearAll")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrganizationLayout>
  );
}
