import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/inbox",
)({
  component: InboxComponent,
});

type NotificationEventData = {
  boardId?: string | null;
  organizationId?: string | null;
};

/**
 * User Inbox (#58): every update on tasks related to the signed-in user,
 * across boards.
 *
 * Reuses the existing /api/notification endpoint, which is already
 * user-scoped and cross-board — no new backend was needed for this half.
 */
function InboxComponent() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const { data, isLoading } = useGetNotifications();

  // Derive the row type from the query rather than restating it; an untyped
  // callback param trips noImplicitAny under tsconfig.app.json.
  type InboxNotification = NonNullable<typeof data>[number];
  const notifications: InboxNotification[] = data ?? [];

  return (
    <OrganizationLayout title={t("inbox:title")}>
      <PageTitle title={t("inbox:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="font-medium text-sm">{t("inbox:title")}</h1>
          <span className="ml-auto text-muted-foreground text-xs">
            {t("inbox:count", { count: notifications.length })}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("inbox:loading")}
            </p>
          ) : notifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("inbox:empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/80">
              {notifications.map((notification) => {
                const eventData = (notification.eventData ??
                  {}) as NotificationEventData;
                const boardId = eventData.boardId ?? undefined;
                const isUnread = !notification.isRead;

                const row = (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                    {/* Unread marker is a dot rather than a bold row, so long
                        titles are not re-flowed when a row is read. */}
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        isUnread ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate" title={notification.title}>
                        {notification.title}
                      </span>
                      {notification.content ? (
                        <span
                          className="truncate text-muted-foreground text-xs"
                          title={notification.content}
                        >
                          {notification.content}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {boardId && notification.resourceId ? (
                      <Link
                        to="/dashboard/organization/$organizationId/board/$boardId/board"
                        params={{ organizationId, boardId }}
                        search={{ taskId: notification.resourceId }}
                        className="block hover:bg-muted/40"
                      >
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </OrganizationLayout>
  );
}
