import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Calendar,
  CalendarClock,
  CalendarX,
  GitMerge,
  GitPullRequest,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TaskFlagBadges from "@/components/flag/task-flag-badges";
import SubtaskOfBadge from "@/components/task/subtask-of-badge";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBoardStore from "@/store/board";
import useBulkSelectionStore from "@/store/bulk-selection";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import { Button } from "../ui/button";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";
import TaskCardContextMenuContent from "./task-card-context-menu/task-card-context-menu-content";
import TaskCardLabels from "./task-labels";

type TaskCardProps = {
  task: Task;
  disableDragDrop?: boolean;
};

function TaskCard({ task, disableDragDrop = false }: TaskCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disableDragDrop });
  const { board } = useBoardStore();
  const { data: organization } = useActiveOrganization();
  const { mutateAsync: deleteTask } = useDeleteTask();
  const navigate = useNavigate();
  const {
    showAssignees,
    showPriority,
    showDueDates,
    showLabels,
    showTaskNumbers,
  } = useUserPreferencesStore();
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  // From the board payload — fetching per card cost one request + preflight
  // each (186 on a 180-task board).
  const externalLinks = task.externalLinks;
  const { toggleSelection, isSelected, isFocused } = useBulkSelectionStore();
  const isTaskSelected = isSelected(task.id);
  const isTaskFocused = isFocused(task.id);

  const pullRequests = useMemo(() => {
    if (!externalLinks) return [];
    return externalLinks.filter((link) => link.resourceType === "pull_request");
  }, [externalLinks]);

  const getPRInfo = (pr: (typeof pullRequests)[number]) => {
    const isMerged = pr.metadata?.merged === true;
    const isDraft = pr.metadata?.draft === true;

    if (isMerged) {
      return {
        icon: <GitMerge className="h-3 w-3 text-info-foreground" />,
        status: t("tasks:pr.merged"),
        statusClass: "text-info-foreground",
      };
    }

    if (isDraft) {
      return {
        icon: <GitPullRequest className="h-3 w-3 text-muted-foreground" />,
        status: t("tasks:pr.draft"),
        statusClass: "text-muted-foreground",
      };
    }

    return {
      icon: <GitPullRequest className="h-3 w-3 text-success-foreground" />,
      status: t("tasks:pr.open"),
      statusClass: "text-success-foreground",
    };
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      transition || "transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    opacity: isDragging ? 0.6 : 1,
    touchAction: isDragging ? "none" : "auto",
    zIndex: isDragging ? 999 : "auto",
  };

  const { data: organizationMembers } = useGetActiveOrganizationMembers(
    organization?.id ?? "",
  );

  const assignee = useMemo(() => {
    return organizationMembers?.members?.find(
      (member) => member.userId === task.userId,
    );
  }, [organizationMembers, task.userId]);

  function handleTaskCardClick(
    e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ) {
    if (!board || !task || !organization) return;

    if ((e as React.MouseEvent).metaKey || (e as React.KeyboardEvent).ctrlKey) {
      toggleSelection(task.id);
      return;
    }

    const currentParams = new URLSearchParams(window.location.search);
    const currentTaskId = currentParams.get("taskId");

    if (currentTaskId === task.id) {
      navigate({
        to: ".",
        search: {},
      });
    } else {
      navigate({
        to: ".",
        search: { taskId: task.id },
      });
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggleSelection(task.id);
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
      queryClient.invalidateQueries({
        queryKey: ["tasks", board?.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:delete.error"),
      );
    } finally {
      toast.success(t("tasks:delete.success"));
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* The menu content is mounted eagerly on purpose. Base UI reads the
          menu's children synchronously when the contextmenu event fires, so
          deferring it via onOpenChange means the first right-click opens
          nothing. Only the delete dialog below is safe to mount lazily. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/** biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown */}
          <div
            onClick={handleTaskCardClick}
            className={`group relative rounded-lg border bg-background p-3 shadow-xs/5 transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98] ${
              disableDragDrop ? "cursor-default" : "cursor-move"
            } ${
              isDragging
                ? "border-ring/40 bg-card shadow-lg"
                : "hover:border-border/90 hover:bg-background hover:shadow-sm"
            } ${
              isTaskSelected
                ? "border-ring/40 bg-accent/50 shadow-sm ring-1 ring-inset ring-ring/30"
                : "border-border"
            } ${isTaskFocused ? "ring-2 ring-inset ring-ring/50" : ""}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleTaskCardClick(e);
              } else if (e.key === "Escape") {
                handleKeyDown(e);
              }
            }}
          >
            {showTaskNumbers && (
              <div className="mb-2 text-[10px] font-mono text-muted-foreground/90">
                {board?.slug}-{task.number}
              </div>
            )}

            {/* Sits above the title so a child card reads as belonging to its
                parent before the reader parses the title. */}
            {task.parentTask && organization?.id && (
              <SubtaskOfBadge
                boardId={task.boardId}
                boardSlug={board?.slug}
                className="mb-2"
                organizationId={organization.id}
                parent={task.parentTask}
              />
            )}

            {showAssignees && (
              <div className="absolute top-3 right-3">
                {task.userId ? (
                  <Avatar className="h-5 w-5">
                    <AvatarImage
                      src={assignee?.user?.image ?? ""}
                      alt={assignee?.user?.name || ""}
                    />
                    <AvatarFallback className="text-xs font-medium border border-border/30">
                      {getInitials(assignee?.user?.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted"
                    title={t("tasks:assignee.unassigned")}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      ?
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mb-2.5 pr-6">
              <div
                className="overflow-hidden break-words text-sm leading-5 font-medium text-foreground/95"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                  hyphens: "auto",
                }}
              >
                {task.title}
              </div>
            </div>

            {showLabels && (
              <div className="mb-2.5">
                <TaskCardLabels labels={task.labels} />
              </div>
            )}

            <div className="mb-2.5">
              <TaskFlagBadges taskId={task.id} />
            </div>

            <div className="flex items-center gap-1.5">
              {showPriority && (
                <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {getPriorityIcon(task.priority ?? "")}
                </span>
              )}

              {showDueDates && task.dueDate && (
                <div
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${dueDateStatusColors[getDueDateStatus(task.dueDate)]}`}
                >
                  {getDueDateStatus(task.dueDate) === "overdue" && (
                    <CalendarX className="w-3 h-3" />
                  )}
                  {getDueDateStatus(task.dueDate) === "due-soon" && (
                    <CalendarClock className="w-3 h-3" />
                  )}
                  {(getDueDateStatus(task.dueDate) === "far-future" ||
                    getDueDateStatus(task.dueDate) === "no-due-date") && (
                    <Calendar className="w-3 h-3" />
                  )}
                  <span>{format(new Date(task.dueDate), "MMM d")}</span>
                </div>
              )}

              {pullRequests.length === 1 && (
                <HoverCard openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(pullRequests[0].url, "_blank");
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                    >
                      {getPRInfo(pullRequests[0]).icon}
                      <span>#{pullRequests[0].externalId}</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    className="w-72 p-3"
                    side="bottom"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getPRInfo(pullRequests[0]).icon}
                        <span>{getPRInfo(pullRequests[0]).status}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>#{pullRequests[0].externalId}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {pullRequests[0].title || t("tasks:pr.label")}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}

              {pullRequests.length > 1 &&
                (() => {
                  const hasOpen = pullRequests.some(
                    (pr) => !pr.metadata?.merged && !pr.metadata?.draft,
                  );
                  const allMerged = pullRequests.every(
                    (pr) => pr.metadata?.merged,
                  );
                  const iconColor = allMerged
                    ? "text-info-foreground"
                    : hasOpen
                      ? "text-success-foreground"
                      : "text-muted-foreground";

                  return (
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                        >
                          <GitPullRequest className={`h-3 w-3 ${iconColor}`} />
                          <span>
                            {t("tasks:pr.count", {
                              count: pullRequests.length,
                            })}
                          </span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-auto min-w-56 max-w-96 p-1"
                        side="bottom"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {pullRequests.map((pr, index) => {
                          const prInfo = getPRInfo(pr);
                          const repoMatch = pr.url.match(
                            /github\.com\/([^/]+\/[^/]+)\/pull/,
                          );
                          const repoName = repoMatch ? repoMatch[1] : null;
                          return (
                            <div key={pr.id}>
                              {index > 0 && (
                                <hr className="border-border my-1" />
                              )}
                              <button
                                type="button"
                                onClick={() => window.open(pr.url, "_blank")}
                                className="w-full px-2 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                              >
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  {prInfo.icon}
                                  <span>
                                    {repoName}#{pr.externalId}
                                  </span>
                                </div>
                                <p className="text-xs leading-tight line-clamp-2 mt-0.5">
                                  {pr.title || t("tasks:pr.label")}
                                </p>
                                <span className="text-[10px] text-muted-foreground">
                                  {prInfo.status}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </HoverCardContent>
                    </HoverCard>
                  );
                })()}
            </div>
          </div>
        </ContextMenuTrigger>

        {board && organization && (
          <TaskCardContextMenuContent
            task={task}
            taskCardContext={{
              boardId: board.id,
              worskpaceId: organization.id,
            }}
            onDeleteClick={() => setIsDeleteTaskModalOpen(true)}
          />
        )}
      </ContextMenu>

      {/* Mounted only while open: it's triggered from a menu item click, which
          happens on a later render, so lazy mounting is safe here. */}
      {isDeleteTaskModalOpen && (
        <AlertDialog
          open={isDeleteTaskModalOpen}
          onOpenChange={setIsDeleteTaskModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("tasks:delete.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("tasks:delete.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose>
                <Button variant="outline" size="sm">
                  {t("common:actions.cancel")}
                </Button>
              </AlertDialogClose>
              <AlertDialogClose onClick={handleDeleteTask}>
                <Button variant="destructive" size="sm">
                  {t("tasks:delete.action")}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default TaskCard;
