import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import TaskLayout from "@/components/common/task-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsContent from "@/components/task/task-details-content";
import {
  TaskDetailsSkeleton,
  TaskPropertiesSidebarSkeleton,
} from "@/components/task/task-page-skeleton";
import TaskPropertiesSidebar from "@/components/task/task-properties-sidebar";
import { Button } from "@/components/ui/button";
import useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";
import useGetBoard from "@/hooks/queries/board/use-get-board";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { getSharedShikiHighlighter } from "@/lib/shiki-highlighter";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/task/$taskId_",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { boardId, organizationId, taskId } = Route.useParams();
  const {
    data: task,
    isLoading: isTaskLoading,
    isError: isTaskError,
  } = useGetTask(taskId);
  const { data: board, isLoading: isBoardLoading } = useGetBoard({
    id: boardId,
    organizationId,
  });
  const { isLoading: isActivitiesLoading } = useGetActivitiesByTaskId(taskId);
  const [isShikiReady, setIsShikiReady] = useState(false);
  useEffect(() => {
    let mounted = true;

    void getSharedShikiHighlighter().then(() => {
      if (!mounted) return;
      setIsShikiReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const isLoading =
    isTaskLoading || isBoardLoading || isActivitiesLoading || !isShikiReady;

  return (
    <TaskLayout
      taskId={taskId}
      boardId={boardId}
      organizationId={organizationId}
      rightSidebar={
        isLoading ? (
          <TaskPropertiesSidebarSkeleton className="h-full w-full lg:w-72 xl:w-80 flex flex-col gap-2" />
        ) : isTaskError || !task ? null : (
          <TaskPropertiesSidebar
            taskId={taskId}
            boardId={boardId}
            organizationId={organizationId}
            className="h-full w-full lg:w-72 xl:w-80 flex flex-col gap-2"
          />
        )
      }
    >
      <PageTitle
        title={
          isLoading
            ? t("tasks:common.loadingTask")
            : isTaskError || !task
              ? t("tasks:common.taskNotFound")
              : `${board?.slug}-${task?.number} — ${task?.title}`
        }
        hideAppName
      />
      {isLoading ? (
        <TaskDetailsSkeleton />
      ) : isTaskError || !task ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">
            {t("tasks:common.taskNotFound")}
          </h1>
          <p className="text-muted-foreground max-w-md">
            {t("tasks:common.taskNotFoundDescription", {
              defaultValue:
                "The task you are looking for does not exist or has been deleted.",
            })}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationId/board/$boardId/board",
                params: { organizationId, boardId },
              })
            }
          >
            {t("navigation:sidebar.backToBoard", {
              defaultValue: "Back to board",
            })}
          </Button>
        </div>
      ) : (
        <TaskDetailsContent
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-2 px-3 pb-16 pt-3 sm:px-4 xl:pb-20 xl:pt-8"
        />
      )}
    </TaskLayout>
  );
}
