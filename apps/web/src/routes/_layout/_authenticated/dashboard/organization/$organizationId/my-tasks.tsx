import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import type { MyTasksRelation } from "@/fetchers/task/get-my-tasks";
import useGetMyTasks from "@/hooks/queries/task/use-get-my-tasks";
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
function MyTasksComponent() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const [relation, setRelation] = useState<MyTasksRelation>("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const { data, isLoading, isFetching } = useGetMyTasks({
    organizationId,
    relation,
    includeCompleted,
  });

  // `data` is the fetcher's json() result, so derive the row type from it
  // rather than restating the shape — an untyped Map value widened `task` to
  // `any` and tripped noImplicitAny under tsconfig.app.json.
  type MyTask = NonNullable<typeof data>[number];
  const tasks: MyTask[] = data ?? [];

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
              {[...byBoard.entries()].map(([boardId, boardTasks]) => (
                <section key={boardId} className="flex flex-col gap-1.5">
                  <h2 className="font-medium text-muted-foreground text-xs">
                    {boardTasks[0]?.boardName ?? boardId}
                  </h2>
                  <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/80">
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
                          {getPriorityIcon(task.priority ?? "")}
                          {/* Long titles clip rather than overflowing the row;
                              the full value stays available as a tooltip. */}
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          {/*
                            #120: status was muted text, which reads as
                            "extra information". The board's own status icon
                            (colour + shape) is far faster to scan; the name
                            stays as the tooltip rather than a second label.
                          */}
                          {task.columnName ? (
                            <span
                              className="inline-flex size-4 shrink-0 items-center justify-center"
                              data-testid="my-task-status-icon"
                              title={task.columnName}
                            >
                              {getColumnIcon(
                                // Colour and default-icon lookup is keyed on
                                // the column SLUG ("to-do", "in-review"), which
                                // lives on `status`. `columnId` is a CUID and
                                // matches nothing, so passing it renders every
                                // status the same muted grey.
                                task.status ?? "",
                                task.isFinal ?? false,
                                task.columnIcon ?? null,
                              )}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </OrganizationLayout>
  );
}
