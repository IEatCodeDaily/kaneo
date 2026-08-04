import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, Flag, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import type { MyTasksRelation } from "@/fetchers/task/get-my-tasks";
import useInfiniteMyTasks from "@/hooks/queries/task/use-infinite-my-tasks";
import { getColumnIcon } from "@/lib/column";
import { getPriorityIcon } from "@/lib/priority";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/my-tasks",
)({
  component: MyTasksComponent,
});

const RELATIONS: { value: MyTasksRelation; labelKey: string }[] = [
  { value: "all", labelKey: "myTasks:relation.all" },
  { value: "assigned", labelKey: "myTasks:relation.assigned" },
  { value: "created", labelKey: "myTasks:relation.created" },
  { value: "team", labelKey: "myTasks:relation.team" },
];

/**
 * Cross-board "My Tasks" page (#58). Tasks are grouped by board so the
 * cross-board nature is visible at a glance rather than being a flat list
 * where every row needs a board label.
 */
export function MyTasksComponent() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const [relation, setRelation] = useState<MyTasksRelation>("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
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
  } = useInfiniteMyTasks({ organizationId, relation, includeCompleted });

  type MyTask = NonNullable<typeof data>["pages"][number][number];
  const allTasks: MyTask[] = data?.pages.flat() ?? [];
  // Flagged is a client-side filter over the already-fetched page: cheap, and
  // it keeps the flag state visible in the count without another round trip.
  const tasks: MyTask[] = flaggedOnly
    ? allTasks.filter((task) => task.flagged)
    : allTasks;

  const byBoard = new Map<string, MyTask[]>();
  for (const task of tasks) {
    const key = task.boardId;
    const existing = byBoard.get(key);
    if (existing) existing.push(task);
    else byBoard.set(key, [task]);
  }

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
                className="h-7 rounded-md px-2 text-xs"
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
            className="h-7 gap-1.5 rounded-md px-2 text-xs"
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
            className="h-7 gap-1.5 rounded-md px-2 text-xs"
          >
            <Flag
              aria-hidden
              className={`size-3.5 ${flaggedOnly ? "opacity-100" : "opacity-40"}`}
            />
            {t("myTasks:flagged")}
          </Button>

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

        <div className="flex-1 overflow-y-auto px-4 py-3">
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
              {[...byBoard.entries()].map(([boardId, boardTasks]) => {
                const collapsed = collapsedBoards.has(boardId);
                return (
                  <section
                    key={boardId}
                    className="overflow-hidden rounded-md border border-border/80"
                  >
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      onClick={() =>
                        setCollapsedBoards((current) => {
                          const next = new Set(current);
                          if (next.has(boardId)) next.delete(boardId);
                          else next.add(boardId);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left hover:bg-muted/40"
                    >
                      <span className="font-medium text-muted-foreground text-xs">
                        {boardTasks[0]?.boardName ?? boardId}
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
                        {boardTasks.map((task) => (
                          <li key={task.id}>
                            <Link
                              to="/dashboard/organization/$organizationId/board/$boardId/board"
                              params={{ organizationId, boardId: task.boardId }}
                              search={{ taskId: task.id }}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
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
                                className="inline-flex size-4 shrink-0 items-center justify-center"
                                data-testid="my-task-status-icon"
                                title={
                                  task.columnName ?? task.status ?? undefined
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
                              </span>
                              {getPriorityIcon(task.priority ?? "")}
                              {/* Long titles clip rather than overflowing the row;
                              the full value stays available as a tooltip. */}
                              <span
                                className="min-w-0 flex-1 truncate"
                                title={task.title}
                              >
                                {task.title}
                              </span>
                              {task.flagged ? (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-[10px] text-destructive uppercase tracking-wide"
                                  title={t("myTasks:flagged")}
                                >
                                  <Flag className="size-3" aria-hidden />
                                  {t("myTasks:flagged")}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        ))}
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
    </OrganizationLayout>
  );
}
