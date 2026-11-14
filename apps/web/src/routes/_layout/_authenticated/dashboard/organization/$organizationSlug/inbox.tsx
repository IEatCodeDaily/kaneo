import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCheck,
  Filter,
  Flag,
  Inbox as InboxIcon,
  ListX,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
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
  // Facets over the loaded updates: event kind and board, any-of within each.
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [boardFilter, setBoardFilter] = useState<string[]>([]);

  const { mutate: markAsRead } = useMarkNotificationAsRead();
  // KFL-329: granular clearing — one notification, or one board group — on top
  // of the existing blunt clear-all. Both call DELETE /notification/:id.
  const { mutate: deleteNotifications } = useDeleteNotification();

  const notifications: Notification[] = data ?? [];
  const boardOf = (n: Notification) => {
    const data = getEventDataRecord(n.eventData);
    return typeof data?.boardId === "string" ? data.boardId : "";
  };
  const typeOptions = [...new Set(notifications.map((n) => n.type))].sort();
  const boardOptions = [
    ...new Map(
      notifications
        .filter((n) => boardOf(n))
        .map((n) => [
          boardOf(n),
          String(getEventDataRecord(n.eventData)?.boardName ?? boardOf(n)),
        ]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const facetCount = typeFilter.length + boardFilter.length;
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const faceted = notifications.filter(
    (n) =>
      (!typeFilter.length || typeFilter.includes(n.type)) &&
      (!boardFilter.length || boardFilter.includes(boardOf(n))),
  );
  const visible = faceted.filter(
    (n) =>
      isFlaggedNotification(n) ||
      filter === "all" ||
      (filter === "unread" ? !n.isRead : n.type === "task_mention"),
  );

  // Every count and bulk action works on the SHOWN updates (tab + facets), so
  // a filtered view never touches updates the user cannot see. Flagged items
  // are standing alerts: never counted as unread, never cleared in bulk.
  const actionable = visible.filter((n) => !isFlaggedNotification(n));
  const unreadIds = actionable.filter((n) => !n.isRead).map((n) => n.id);
  const readIds = actionable.filter((n) => n.isRead).map((n) => n.id);
  const flaggedCount = visible.filter(isFlaggedNotification).length;
  const isFiltered = facetCount > 0 || filter !== "all";
  const facetNames = [
    ...typeFilter.map((type) =>
      t(`notifications:events.${type}.title`, {
        defaultValue: type,
        commenterName: "",
        actorName: "",
      }).trim(),
    ),
    ...boardFilter.map(
      (id) => boardOptions.find(([optionId]) => optionId === id)?.[1] ?? id,
    ),
  ];

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

  // The ids are captured when the dialog opens, so a refetch while it is open
  // cannot widen what gets deleted.
  const [clearIds, setClearIds] = useState<string[]>([]);
  const handleClearAll = () => {
    deleteNotifications(clearIds);
    setShowClearDialog(false);
  };

  return (
    <OrganizationLayout title={t("inbox:title")}>
      <PageTitle title={t("inbox:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-semibold text-sm">{t("inbox:title")}</h1>
          <span className="text-muted-foreground text-xs tabular-nums">
            {isFiltered
              ? t("inbox:shownOfLoaded", {
                  shown: visible.length,
                  count: notifications.length,
                })
              : t("inbox:count", { count: notifications.length })}
          </span>
          {unreadIds.length > 0 ? (
            <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-medium text-info text-xs">
              {t("inbox:unreadCount", { count: unreadIds.length })}
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
                className="min-h-11 min-w-11 aria-pressed:shadow-[inset_0_0_0_1px_var(--border)] sm:min-h-8"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`inbox:filter.${value}`)}
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="xs"
                    variant="outline"
                    className={`min-h-11 gap-1.5 sm:min-h-8 ${
                      facetCount
                        ? "border-foreground/30 bg-accent text-foreground"
                        : ""
                    }`}
                  />
                }
              >
                <Filter className="size-3" aria-hidden />
                {t("common:actions.filter")}
                {facetCount ? (
                  <span className="rounded-full bg-primary/15 px-1.5 text-xs tabular-nums">
                    {facetCount}
                  </span>
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* A menu label must sit inside a group (Base UI error #31). */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs uppercase tracking-wide">
                    {t("tasks:boardFilters.filterBy")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 text-sm sm:min-h-0">
                    {t("inbox:filterType")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
                    {typeOptions.map((type) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        className="min-h-11 sm:min-h-8"
                        checked={typeFilter.includes(type)}
                        onCheckedChange={() =>
                          setTypeFilter((list) => toggle(list, type))
                        }
                      >
                        {/* Event titles may interpolate an actor; the
                            filter lists the kind, so drop the name. */}
                        {t(`notifications:events.${type}.title`, {
                          defaultValue: type,
                          commenterName: "",
                          actorName: "",
                        }).trim()}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 text-sm sm:min-h-0">
                    {t("inbox:filterBoard")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
                    {boardOptions.map(([id, name]) => (
                      <DropdownMenuCheckboxItem
                        key={id}
                        className="min-h-11 sm:min-h-8"
                        checked={boardFilter.includes(id)}
                        onCheckedChange={() =>
                          setBoardFilter((list) => toggle(list, id))
                        }
                      >
                        {name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {facetCount ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="h-8 min-h-11 text-muted-foreground text-sm sm:min-h-0"
                      onClick={() => {
                        setTypeFilter([]);
                        setBoardFilter([]);
                      }}
                    >
                      {t("common:actions.clearAllFilters")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* One recipe for every bulk action. Phones show icons only (the
              label stays for assistive tech) so the row fits beside Filter. */}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="xs"
              variant="outline"
              className="min-h-11 min-w-11 gap-1.5 px-2 text-xs sm:min-h-8 sm:min-w-0"
              aria-label={t("inbox:clearRead")}
              disabled={!readIds.length}
              onClick={() => deleteNotifications(readIds)}
            >
              <ListX className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {t("inbox:clearRead")}
              </span>
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="min-h-11 min-w-11 gap-1.5 px-2 text-xs sm:min-h-8 sm:min-w-0"
              aria-label={t("common:actions.markAllRead")}
              disabled={!unreadIds.length}
              onClick={() =>
                unreadIds.forEach((id) => {
                  markAsRead(id);
                })
              }
            >
              <CheckCheck className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {t("common:actions.markAllRead")}
              </span>
            </Button>
            <Button
              size="xs"
              variant="destructive-outline"
              className="min-h-11 min-w-11 gap-1.5 px-2 text-xs sm:min-h-8 sm:min-w-0"
              aria-label={t("inbox:clearShown", { count: actionable.length })}
              disabled={!actionable.length}
              onClick={() => {
                setClearIds(actionable.map((n) => n.id));
                setShowClearDialog(true);
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">
                {t("inbox:clearShown", { count: actionable.length })}
              </span>
            </Button>
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
            className={`min-w-0 flex-1 overflow-y-auto py-3 sm:px-4 ${preview ? "lg:max-w-[26rem] lg:border-r" : ""}`}
          >
            <p className="mb-3 px-4 text-muted-foreground text-xs sm:px-0">
              {t("inbox:globalScope")}
            </p>
            {facetNames.length > 0 ? (
              <p className="mb-3 flex flex-wrap items-center gap-1.5 px-4 text-xs sm:px-0">
                <span className="text-muted-foreground">
                  {t("inbox:filteredBy")}
                </span>
                {facetNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-md border border-border bg-accent px-1.5 py-0.5 text-foreground"
                  >
                    {name}
                  </span>
                ))}
                <Button
                  size="xs"
                  variant="ghost"
                  className="min-h-11 px-2 text-xs sm:min-h-6"
                  onClick={() => {
                    setTypeFilter([]);
                    setBoardFilter([]);
                  }}
                >
                  {t("common:actions.clearAllFilters")}
                </Button>
              </p>
            ) : null}
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
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-muted-foreground text-sm">
                  {t("inbox:emptyFiltered")}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  className="min-h-11 px-3 text-xs sm:min-h-8"
                  onClick={() => {
                    setTypeFilter([]);
                    setBoardFilter([]);
                    setFilter("all");
                  }}
                >
                  {t("common:actions.clearAllFilters")}
                </Button>
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
              {t("inbox:clearShownTitle", { count: clearIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("inbox:clearShownDescription", { count: clearIds.length })}
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
                {t("inbox:clearShown", { count: clearIds.length })}
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
