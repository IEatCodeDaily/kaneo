import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import { getNotificationTitle } from "@/components/notification/notification-dropdown";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useInfiniteMyTasks from "@/hooks/queries/task/use-infinite-my-tasks";
import { useLocalDay } from "@/hooks/use-local-day";
import { formatRelativeTime } from "@/lib/format";
import {
  groupMyTasks,
  localDateKey,
  type MyTaskViewItem,
  sortMyTasks,
} from "@/lib/my-tasks-view";
import type { Notification } from "@/types/notification";

export default function PersonalHome() {
  const { t } = useTranslation();
  const day = useLocalDay();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const base = `/dashboard/organization/${organization?.slug ?? ""}`;
  const assigned = useInfiniteMyTasks({
    organizationId,
    relation: "assigned",
    includeCompleted: false,
  });
  const boards = useGetBoards({ organizationId });
  const notifications = useGetNotifications();
  const tasks = (assigned.data?.pages.flat() ?? [])
    .filter((task) => !task.boardArchivedAt)
    .map((task) => ({ ...task, labels: task.labels ?? [] }));
  const ordered = sortMyTasks(tasks as MyTaskViewItem[], "dueDate");
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(day);
    date.setDate(date.getDate() + index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      date,
      count: tasks.filter(
        (task) => task.dueDate && localDateKey(task.dueDate) === dateKey,
      ).length,
    };
  });
  const groups = groupMyTasks(ordered, "dueDate", new Date(day));
  const recent = (notifications.data ?? [])
    .filter((notification: Notification) => {
      const data = notification.eventData as Record<string, unknown> | null;
      return data?.organizationId === organizationId;
    })
    .slice(0, 6);
  return (
    <OrganizationLayout title={t("home:title")}>
      <PageTitle title={t("home:title")} />
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }).format(new Date(day))}
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("home:title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("home:subtitle")}
              </p>
            </div>
            <Link
              className="text-sm underline-offset-4 hover:underline"
              to={`${base}/my-tasks`}
            >
              {t("home:allTasks")} <ArrowUpRight className="inline size-3.5" />
            </Link>
          </header>
          <section
            aria-label={t("home:week")}
            className="grid grid-cols-7 divide-x rounded-lg border border-border bg-card"
          >
            {week.map(({ date, count }) => (
              <div
                key={date.toDateString()}
                className="min-w-0 px-1 py-3 text-center sm:px-3"
              >
                <p className="text-xs uppercase text-muted-foreground sm:text-xs">
                  {new Intl.DateTimeFormat(undefined, {
                    weekday: "short",
                  }).format(date)}
                </p>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {date.getDate()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {assigned.isLoading || assigned.isError ? "—" : count}
                </p>
              </div>
            ))}
          </section>
          {assigned.hasNextPage && (
            <p className="text-xs text-muted-foreground">
              {t("home:partialTasks")}
            </p>
          )}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-8">
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">{t("home:upNext")}</h2>
                {assigned.isError ? (
                  <div role="alert">
                    <p className="text-sm">{t("home:loadError")}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void assigned.refetch()}
                    >
                      {t("common:error.tryAgain")}
                    </Button>
                  </div>
                ) : assigned.isLoading ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t("home:loading")}
                  </p>
                ) : !ordered.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t("home:noTasks")}
                  </p>
                ) : (
                  <div className="divide-y rounded-lg border border-border">
                    {groups.map(([name, items]) => (
                      <div key={name}>
                        <p className="bg-muted/30 px-3 py-2 text-xs font-medium">
                          {t(`home:due.${name}`, { defaultValue: name })}
                        </p>
                        {items.slice(0, 4).map((task) => (
                          <Link
                            key={task.id}
                            to={`${base}/board/${tasks.find((item) => item.id === task.id)?.boardSlug ?? task.boardId}/board`}
                            search={{ taskId: task.id }}
                            className="flex min-w-0 items-center gap-2 px-3 py-3 text-sm hover:bg-muted/40"
                          >
                            <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">
                              {task.title}
                            </span>
                            <span className="max-w-28 truncate text-xs text-muted-foreground">
                              {task.boardName}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t("home:boards")}</h2>
                  <Link
                    className="text-xs text-muted-foreground hover:underline"
                    to={base}
                  >
                    {t("home:allBoards")}
                  </Link>
                </div>
                {boards.isError ? (
                  <p role="alert" className="text-sm">
                    {t("home:loadError")}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {boards.data
                      ?.filter((board) => !board.archivedAt)
                      .slice(0, 3)
                      .map((board) => (
                        <Link
                          key={board.id}
                          to={`${base}/board/${board.slug}/board`}
                          className="min-w-0 rounded-lg border border-border p-3 hover:bg-muted/30"
                        >
                          <p className="truncate text-sm font-medium">
                            {board.name}
                          </p>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {board.statistics?.completionPercentage ?? 0}%
                          </p>
                          <progress
                            className="mt-2 h-1 w-full"
                            max={100}
                            value={board.statistics?.completionPercentage ?? 0}
                          />
                        </Link>
                      ))}
                  </div>
                )}
              </section>
            </div>
            <section className="min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("home:recent")}</h2>
                <Link
                  className="text-xs text-muted-foreground hover:underline"
                  to={`${base}/inbox`}
                >
                  {t("home:inbox")}
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("home:recentScope")}
              </p>
              {notifications.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("home:loading")}
                </p>
              ) : notifications.isError ? (
                <p role="alert" className="text-sm">
                  {t("home:loadError")}
                </p>
              ) : recent.length ? (
                <ul className="divide-y">
                  {recent.map((notification: Notification) => (
                    <li key={notification.id} className="py-3">
                      <Link
                        className="block text-sm hover:underline"
                        to={`${base}/inbox`}
                      >
                        {getNotificationTitle(notification, t)}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("home:noActivity")}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </OrganizationLayout>
  );
}
