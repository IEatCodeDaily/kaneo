import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCheck, Flag, Inbox as InboxIcon, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import InboxTicketList from "@/components/notification/inbox-ticket-list";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet, {
  TaskDetailsPanel,
} from "@/components/task/task-details-sheet";
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
import useDeleteNotification from "@/hooks/mutations/notification/use-delete-notification";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useMarkNotificationAsUnread from "@/hooks/mutations/notification/use-mark-notification-as-unread";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useIsMobile } from "@/hooks/use-mobile";
import { isFlaggedNotification } from "@/lib/group-inbox-notifications";
import type { Notification } from "@/types/notification";

type InboxSearch = {
  taskId?: string;
  boardId?: string;
  organizationId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/inbox",
)({
  component: InboxComponent,
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    boardId: typeof search.boardId === "string" ? search.boardId : undefined,
    organizationId:
      typeof search.organizationId === "string"
        ? search.organizationId
        : undefined,
  }),
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
export function InboxComponent() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [preview, setPreview] = useState<{
    taskId: string;
    boardId: string;
    organizationId: string;
    unreadCount: number;
  } | null>(null);
  const { mutate: markAsUnread } = useMarkNotificationAsUnread();
  const navigate = useNavigate();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const {
    taskId: openTaskId,
    boardId: openBoardId,
    organizationId: targetOrganizationId,
  } = Route.useSearch();
  const { data, isLoading, isError, refetch } = useGetNotifications();
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const [showClearDialog, setShowClearDialog] = useState(false);

  const { mutate: markAsRead } = useMarkNotificationAsRead();
  // KFL-329: granular clearing — one notification, or one board group — on top
  // of the existing blunt clear-all. Both call DELETE /notification/:id.
  const { mutate: deleteNotifications } = useDeleteNotification();

  const notifications: Notification[] = data ?? [];
  // Flagged items are standing alerts, not "unread": they are excluded from the
  // unread count and get their own counter.
  const unreadCount = notifications.filter(
    (n) => !n.isRead && !isFlaggedNotification(n),
  ).length;
  const flaggedCount = notifications.filter(isFlaggedNotification).length;
  const visible = notifications.filter(
    (n) =>
      isFlaggedNotification(n) ||
      filter === "all" ||
      (filter === "unread" ? !n.isRead : n.type === "task_mention"),
  );

  const readIds = notifications
    .filter((n) => n.isRead && !isFlaggedNotification(n))
    .map((n) => n.id);

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      const eventData = getEventDataRecord(notification.eventData);
      const boardId =
        typeof eventData?.boardId === "string" ? eventData.boardId : null;
      const taskId = notification.resourceId ?? null;

      if (notification.resourceType === "task" && boardId && taskId) {
        // Open the ticket drawer OVER the inbox — stay on this route, just set
        // the search param the mounted TaskDetailsSheet reacts to.
        setPreview({
          taskId,
          boardId,
          unreadCount: notifications.filter(
            (n) =>
              n.resourceId === taskId &&
              n.resourceType === "task" &&
              !n.isRead &&
              !isFlaggedNotification(n),
          ).length,
          organizationId:
            typeof eventData?.organizationId === "string"
              ? eventData.organizationId
              : organizationId,
        });
        if (isMobile || window.innerWidth < 1024)
          navigate({
            to: ".",
            search: {
              taskId,
              boardId,
              organizationId:
                typeof eventData?.organizationId === "string"
                  ? eventData.organizationId
                  : organizationId,
            },
          });
      }
    },
    [navigate, isMobile, organizationId, notifications],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({ to: ".", search: {} });
  }, [navigate]);

  const handleClearAll = () => {
    deleteNotifications(
      notifications.filter((n) => !isFlaggedNotification(n)).map((n) => n.id),
    );
    setShowClearDialog(false);
  };

  return (
    <OrganizationLayout title={t("inbox:title")}>
      <PageTitle title={t("inbox:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-medium text-sm">{t("inbox:title")}</h1>
          <span className="text-muted-foreground text-xs">
            {t("inbox:count", { count: notifications.length })}
          </span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-medium text-info text-xs">
              {t("inbox:unreadCount", { count: unreadCount })}
            </span>
          ) : null}
          {flaggedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive text-xs">
              <Flag className="size-3" aria-hidden />
              {t("inbox:flaggedCount", { count: flaggedCount })}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            {(["all", "unread", "mentions"] as const).map((value) => (
              <Button
                key={value}
                size="xs"
                variant={filter === value ? "secondary" : "ghost"}
                className="min-h-11 min-w-11 sm:min-h-8"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`inbox:filter.${value}`)}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              className="min-h-11 min-w-11 sm:min-h-8"
              disabled={!readIds.length}
              onClick={() => deleteNotifications(readIds)}
            >
              {t("inbox:clearRead")}
            </Button>
            {unreadCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 gap-1.5 text-xs sm:min-h-8"
                onClick={() =>
                  visible
                    .filter((n) => !n.isRead && !isFlaggedNotification(n))
                    .forEach((n) => {
                      markAsRead(n.id);
                    })
                }
              >
                <CheckCheck className="size-3.5" />
                {t("common:actions.markAllRead")}
              </Button>
            ) : null}
            {notifications.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 gap-1.5 text-xs sm:min-h-8"
                onClick={() => setShowClearDialog(true)}
              >
                <Trash2 className="size-3.5" />
                {t("notifications:clearAll")}
              </Button>
            ) : null}
          </div>
        </div>

        <fieldset
          className="flex min-h-0 min-w-0 flex-1"
          aria-label={t("inbox:title")}
          onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("input,textarea,[contenteditable=true]")) return;
            if (event.key.toLowerCase() === "r") {
              const composer = event.currentTarget.querySelector<HTMLElement>(
                '.kaneo-comment-editor-content [contenteditable="true"]',
              );
              if (composer) {
                event.preventDefault();
                composer.focus();
              }
              return;
            }
            const row = target.closest<HTMLElement>("[data-notification-id]");
            if (!row) return;
            const rows = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "[data-notification-id]",
              ),
            ];
            const index = rows.indexOf(row);
            if (["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) {
              event.preventDefault();
              rows[
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    index +
                      (event.key === "ArrowDown" || event.key === "j" ? 1 : -1),
                  ),
                )
              ]?.focus();
            }
          }}
        >
          <div
            className={`min-w-0 flex-1 overflow-y-auto px-4 py-3 ${preview ? "lg:max-w-[26rem] lg:border-r" : ""}`}
          >
            <p className="mb-3 text-xs text-muted-foreground">
              {t("inbox:globalScope")}
            </p>
            {isError && (
              <div role="alert" className="mb-3 flex gap-3 text-sm">
                <span>{t("home:loadError")}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refetch()}
                >
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            )}
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
              <InboxTicketList
                notifications={visible}
                selectedTaskId={preview?.taskId}
                organizationId={organizationId}
                onSelect={handleNotificationClick}
                onRead={markAsRead}
                onUnread={markAsUnread}
                onDismiss={deleteNotifications}
              />
            )}
          </div>
          {preview && !openTaskId && !isMobile && (
            <aside
              aria-label={t("inbox:preview")}
              className="hidden min-w-0 flex-1 flex-col overflow-hidden bg-background lg:flex"
            >
              {/* Same panel as the ticket drawer: header, properties bar,
                  description and activity, editable in place. */}
              {preview.unreadCount > 0 && (
                <p className="border-b border-border bg-info/5 px-4 py-1.5 text-xs text-info">
                  {t("inbox:newSinceRead", { count: preview.unreadCount })}
                </p>
              )}
              <TaskDetailsPanel
                taskId={preview.taskId}
                boardId={preview.boardId}
                organizationId={preview.organizationId}
                onClose={() => setPreview(null)}
              />
            </aside>
          )}
        </fieldset>
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

      {/* Ticket drawer opens over the inbox — never leaves this route. */}
      {openTaskId && openBoardId ? (
        <TaskDetailsSheet
          taskId={openTaskId}
          boardId={openBoardId}
          organizationId={
            targetOrganizationId ??
            (preview && preview.taskId === openTaskId
              ? preview.organizationId
              : (
                  notifications.find((n) => n.resourceId === openTaskId)
                    ?.eventData as { organizationId?: string } | undefined
                )?.organizationId) ??
            organizationId
          }
          onClose={handleCloseTaskSheet}
        />
      ) : null}
    </OrganizationLayout>
  );
}
