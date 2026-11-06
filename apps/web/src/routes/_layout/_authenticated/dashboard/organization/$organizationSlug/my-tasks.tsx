import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  Flag,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveLabelColor } from "@/constants/label-colors";
import type { MyTasksRelation } from "@/fetchers/task/get-my-tasks";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useInfiniteMyTasks from "@/hooks/queries/task/use-infinite-my-tasks";
import { useLocalDay } from "@/hooks/use-local-day";
import { getColumnIcon } from "@/lib/column";
import {
  groupMyTasks,
  localDateKey,
  type MyTasksGroup,
  type MyTasksSort,
  sortMyTasks,
  summarizeTicketStatuses,
  ticketDueState,
} from "@/lib/my-tasks-view";
import { getPriorityIcon } from "@/lib/priority";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/my-tasks",
)({
  component: MyTasksComponent,
  // The open ticket lives in the URL so the drawer survives reloads and
  // links, exactly like the board drawer.
  validateSearch: (
    search: Record<string, unknown>,
  ): { taskId?: string; boardId?: string } => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    boardId: typeof search.boardId === "string" ? search.boardId : undefined,
  }),
});

const RELATIONS: { value: MyTasksRelation; labelKey: string }[] = [
  { value: "all", labelKey: "myTasks:relation.all" },
  { value: "assigned", labelKey: "myTasks:relation.assigned" },
  { value: "created", labelKey: "myTasks:relation.created" },
  { value: "team", labelKey: "myTasks:relation.team" },
  { value: "followed", labelKey: "myTasks:relation.followed" },
];

/**
 * Cross-board "My Tasks" page (#58). Tasks are grouped by board so the
 * cross-board nature is visible at a glance rather than being a flat list
 * where every row needs a board label.
 */
export function MyTasksComponent() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const day = useLocalDay();
  const navigate = useNavigate();
  const { taskId: openTaskId, boardId: openBoardId } = Route.useSearch();
  const [relation, setRelation] = useState<MyTasksRelation>("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const displayKey = `${user?.id ?? ""}:${organizationId}`;
  const savedDisplay = useUserPreferencesStore(
    (state) => state.ticketDisplay[displayKey],
  );
  const saveDisplay = useUserPreferencesStore(
    (state) => state.setTicketDisplay,
  );
  const sort = savedDisplay?.sort ?? "updated";
  const group = savedDisplay?.group ?? "status";
  const setSort = (sort: MyTasksSort) =>
    saveDisplay(displayKey, { sort, group });
  const setGroup = (group: MyTasksGroup) =>
    saveDisplay(displayKey, { sort, group });
  const [dueFilter, setDueFilter] = useState<"overdue" | "soon" | null>(null);
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(
    new Set(),
  );

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    refetch,
  } = useInfiniteMyTasks({ organizationId, relation, includeCompleted });

  type MyTask = NonNullable<typeof data>["pages"][number][number];
  const allTasks: MyTask[] = (data?.pages.flat() ?? []).map((task) => ({
    ...task,
    labels: task.labels ?? [],
    dueDate: task.dueDate ?? null,
    createdAt: task.createdAt ?? task.updatedAt ?? new Date(0).toISOString(),
    updatedAt: task.updatedAt ?? task.createdAt ?? new Date(0).toISOString(),
  }));
  // Flagged is a client-side filter over the already-fetched page: cheap, and
  // it keeps the flag state visible in the count without another round trip.
  const relationFiltered: MyTask[] = flaggedOnly
    ? allTasks.filter((task) => task.flagged)
    : allTasks;
  const tasks = sortMyTasks(
    relationFiltered.filter(
      (task) =>
        (!dueFilter ||
          ticketDueState(task.dueDate, task.isFinal ?? false, new Date(day)) ===
            dueFilter) &&
        `${task.title} ${task.boardName} ${task.labels.map((label: { name: string }) => label.name).join(" ")}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    ),
    sort,
  );
  const groupedTasks = groupMyTasks(tasks, group, new Date(day));
  const statuses = summarizeTicketStatuses(tasks);

  return (
    <OrganizationLayout title={t("myTasks:title")}>
      <PageTitle title={t("myTasks:title")} />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-4 py-3">
          <h1 className="mr-2 font-medium text-sm">{t("myTasks:title")}</h1>

          <div className="flex items-center gap-1">
            {RELATIONS.map(({ value, labelKey }) => (
              <Button
                key={value}
                type="button"
                size="xs"
                variant={relation === value ? "secondary" : "ghost"}
                aria-pressed={relation === value}
                onClick={() => setRelation(value)}
                className="min-h-11 min-w-11 rounded-md px-3 text-xs sm:min-h-8"
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            size="xs"
            variant={includeCompleted ? "secondary" : "outline"}
            aria-pressed={includeCompleted}
            onClick={() => setIncludeCompleted((previous) => !previous)}
            className="min-h-11 gap-1.5 rounded-md px-3 text-xs sm:min-h-8"
          >
            {/* An explicit check mark, so the on/off state is legible without
                relying on a subtle background shade alone. */}
            <Check
              aria-hidden
              className={`size-3.5 ${
                includeCompleted ? "opacity-100" : "opacity-30"
              }`}
            />
            {t("myTasks:includeCompleted")}
          </Button>

          <Button
            type="button"
            size="xs"
            variant={flaggedOnly ? "secondary" : "outline"}
            aria-pressed={flaggedOnly}
            onClick={() => setFlaggedOnly((previous) => !previous)}
            className="min-h-11 gap-1.5 rounded-md px-3 text-xs sm:min-h-8"
          >
            <Flag
              aria-hidden
              className={`size-3.5 ${flaggedOnly ? "opacity-100" : "opacity-40"}`}
            />
            {t("myTasks:flagged")}
          </Button>

          {(["overdue", "soon"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={dueFilter === value ? "secondary" : "outline"}
              aria-pressed={dueFilter === value}
              onClick={() =>
                setDueFilter((previous) => (previous === value ? null : value))
              }
              className="min-h-11 gap-1.5 sm:min-h-8"
            >
              <CalendarDays className="size-3.5" />
              {t(
                value === "overdue"
                  ? "home:due.Overdue"
                  : "home:due.Next 7 days",
                {
                  defaultValue: value === "overdue" ? "Overdue" : "Next 7 days",
                },
              )}
            </Button>
          ))}
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter tickets…"
            aria-label="Filter tickets"
            className="min-h-11 w-full text-xs sm:min-h-8 sm:w-44"
          />
          <details className="relative ml-auto">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md border px-3 text-xs sm:min-h-8">
              {t("settings:navigation.display", { defaultValue: "Display" })}
            </summary>
            <div className="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-lg border bg-popover p-4 shadow-lg">
              <select
                aria-label="Sort tickets"
                value={sort}
                onChange={(event) => setSort(event.target.value as MyTasksSort)}
                className="min-h-11 rounded-md border bg-background px-2 text-xs sm:min-h-8"
              >
                <option value="updated">Recently updated</option>
                <option value="created">Created date</option>
                <option value="dueDate">Due date</option>
                <option value="priority">Priority</option>
                <option value="title">Title</option>
                <option value="number">Ticket number</option>
              </select>
              <select
                aria-label="Group tickets"
                value={group}
                onChange={(event) =>
                  setGroup(event.target.value as MyTasksGroup)
                }
                className="min-h-11 rounded-md border bg-background px-2 text-xs sm:min-h-8"
              >
                <option value="board">Board</option>
                <option value="none">None</option>
                <option value="status">Status</option>
                <option value="priority">Priority</option>
                <option value="label">Label</option>
                <option value="dueDate">Due date</option>
                <option value="assignee">Assignee</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>
          </details>

          {isFetching ? (
            <Loader2
              aria-hidden
              className="size-3.5 animate-spin text-muted-foreground"
            />
          ) : null}

          <span className="ml-auto text-muted-foreground text-xs">
            {t("myTasks:count", { count: tasks.length })}
          </span>
        </div>

        <section
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-3 text-xs"
          aria-label={t("myTasks:loadedSummary", { count: tasks.length })}
        >
          <span className="text-muted-foreground">
            {t("myTasks:loadedSummary", { count: tasks.length })}
          </span>
          {statuses.map(({ slug, name, count, percent }) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1.5 tabular-nums"
            >
              {getColumnIcon(
                slug,
                tasks.find((task) => task.status === slug)?.isFinal ?? false,
                tasks.find((task) => task.status === slug)?.columnIcon,
              )}
              {name || t("myTasks:noStatus")} <strong>{count}</strong>
              <span className="text-muted-foreground">{percent}%</span>
            </span>
          ))}
        </section>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isError && (
            <div role="alert" className="mb-3 flex items-center gap-3 text-sm">
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
          {hasNextPage && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t("home:loadedOnly")}
            </p>
          )}
          {isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("myTasks:loading")}
            </p>
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("myTasks:empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groupedTasks.map(([groupName, boardTasks]) => {
                const collapsed = collapsedBoards.has(groupName);
                return (
                  <section
                    key={groupName}
                    className="overflow-hidden rounded-md border border-border/80"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() =>
                        setCollapsedBoards((current) => {
                          const next = new Set(current);
                          if (next.has(groupName)) next.delete(groupName);
                          else next.add(groupName);
                          return next;
                        })
                      }
                      className="flex min-h-11 w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left hover:bg-muted/40 sm:min-h-8"
                    >
                      <span className="font-medium text-muted-foreground text-xs">
                        {group === "dueDate"
                          ? t(`home:due.${groupName}`, {
                              defaultValue: groupName,
                            })
                          : group === "status"
                            ? (boardTasks[0]?.columnName ?? groupName)
                            : groupName}
                      </span>
                      <span className="text-muted-foreground/70 text-xs">
                        {boardTasks.length} tickets
                      </span>
                      <ChevronDown
                        className={`ml-auto size-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                    {collapsed ? null : (
                      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/80">
                        {boardTasks.map((task) => {
                          const flagColor = task.flagColor ?? undefined;
                          const flagLabel =
                            task.flagName ?? t("myTasks:flagged");
                          /*
                            Same rule as `archiveBadgeParts` (#226): archival is
                            orthogonal to status, so the status icon keeps
                            rendering and the Archive glyph layers on top. The
                            predicate is inlined rather than imported because
                            lib/archive-display pulls in the i18n runtime, which
                            the other archived-glyph surfaces avoid too.
                          */
                          const boardArchived = task.boardArchivedAt != null;
                          return (
                            <li key={task.id}>
                              <Link
                                from={Route.fullPath}
                                to="."
                                search={{
                                  taskId: task.id,
                                  boardId: task.boardId,
                                }}
                                aria-current={
                                  openTaskId === task.id ? "true" : undefined
                                }
                                className="flex flex-wrap items-center gap-2 border-l-2 border-l-transparent px-3 py-2 text-sm hover:bg-muted/40 aria-[current=true]:bg-muted/60"
                                // Flagged rows are tinted in the flag's own
                                // colour (faint bg + a matching left accent),
                                // so the flag reads at a glance.
                                style={
                                  task.flagged && flagColor
                                    ? {
                                        backgroundColor: `${flagColor}14`,
                                        borderLeftColor: flagColor,
                                      }
                                    : undefined
                                }
                              >
                                {/* Board-scoped ids can be long (slug + number), so
                              this column is fixed-width and clips instead of
                              wrapping into several ragged lines. */}
                                <span
                                  className="w-28 shrink-0 truncate font-mono text-[11px] text-muted-foreground"
                                  title={
                                    task.boardSlug
                                      ? `${task.boardSlug}-${task.number}`
                                      : `#${task.number}`
                                  }
                                >
                                  {task.boardSlug
                                    ? `${task.boardSlug}-${task.number}`
                                    : `#${task.number}`}
                                </span>
                                {/*
                            #120: status icon sits to the LEFT of priority, so
                            the row reads id -> status -> priority -> title.
                            Muted text was "extra information"; the board's own
                            icon (colour + shape) is far faster to scan and the
                            name stays as the tooltip, not a second label.
                          */}
                                {/*
                            #120 (round 3): the slot is ALWAYS rendered, even
                            for planned/archived tickets that carry no column —
                            skipping it collapsed the row and broke the column
                            alignment against its neighbours.
                          */}
                                <span
                                  className="relative inline-flex size-4 shrink-0 items-center justify-center"
                                  data-testid="my-task-status-icon"
                                  title={
                                    boardArchived
                                      ? [
                                          task.columnName ?? task.status ?? "",
                                          t("myTasks:boardArchived"),
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")
                                      : (task.columnName ??
                                        task.status ??
                                        undefined)
                                  }
                                >
                                  {getColumnIcon(
                                    // Colour and default-icon lookup is keyed on the
                                    // column SLUG ("to-do", "in-review"), which lives
                                    // on `status`. `columnId` is a CUID and matches
                                    // nothing, so passing it renders every status the
                                    // same muted grey.
                                    task.status ?? "",
                                    task.isFinal ?? false,
                                    task.columnIcon ?? null,
                                  )}
                                  {/*
                                    KFL-190: the ticket's BOARD is archived, so
                                    the row reuses the same layered Archive
                                    glyph the list view and detail sidebar use
                                    for archived tickets — archival stays
                                    orthogonal to the workflow status icon.
                                  */}
                                  {boardArchived ? (
                                    <Archive
                                      aria-hidden="true"
                                      className="-bottom-1 -right-1 absolute size-2.5 rounded-full bg-background text-muted-foreground"
                                      data-testid="my-task-board-archived"
                                    />
                                  ) : null}
                                </span>
                                {getPriorityIcon(task.priority ?? "")}
                                {/* Long titles clip rather than overflowing the row;
                              the full value stays available as a tooltip. */}
                                <span
                                  className="order-first w-full whitespace-normal break-words font-medium sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate"
                                  title={task.title}
                                >
                                  {task.title}
                                </span>
                                {task.labels.map(
                                  (label: {
                                    id: string;
                                    name: string;
                                    color: string;
                                  }) => {
                                    const colors = resolveLabelColor(
                                      label.color,
                                    );
                                    return (
                                      <span
                                        key={label.id}
                                        className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]"
                                        style={{
                                          color: colors,
                                          borderColor: colors,
                                        }}
                                      >
                                        {label.name}
                                      </span>
                                    );
                                  },
                                )}
                                {task.dueDate ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
                                    <CalendarDays className="size-3" />
                                    {new Intl.DateTimeFormat(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    }).format(
                                      new Date(
                                        `${localDateKey(task.dueDate)}T00:00:00`,
                                      ),
                                    )}
                                  </span>
                                ) : null}
                                {task.flagged ? (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide"
                                    title={flagLabel}
                                    style={{
                                      color: flagColor,
                                      backgroundColor: flagColor
                                        ? `${flagColor}22`
                                        : undefined,
                                    }}
                                  >
                                    <Flag className="size-3" aria-hidden />
                                    {flagLabel}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
              {hasNextPage ? (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                  >
                    {isFetchingNextPage
                      ? t("myTasks:loading")
                      : t("common:pagination.next")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {openTaskId && openBoardId ? (
        <TaskDetailsSheet
          taskId={openTaskId}
          boardId={openBoardId}
          organizationId={organizationId}
          onClose={() => navigate({ to: ".", search: {} })}
        />
      ) : null}
    </OrganizationLayout>
  );
}
