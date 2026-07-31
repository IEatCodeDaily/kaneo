import { Check, Milestone, Search, Workflow, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Milestone as MilestoneRow } from "@/fetchers/milestone/get-milestones-by-board";
import useGetMilestonesByBoard from "@/hooks/queries/milestone/use-get-milestones-by-board";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";

export type CreateTaskTopbarProps = {
  boardId: string;
  milestoneId: string | null;
  onMilestoneChange: (milestoneId: string | null) => void;
  parentTaskId: string | null;
  onParentTaskChange: (taskId: string | null) => void;
  disabled?: boolean;
};

type PickableTask = {
  id: string;
  title: string;
  number: number | null;
};

/**
 * Topbar row for the create-task modal: pick the milestone and the parent task
 * before the task exists. Both are applied after creation (milestone via the
 * board-scoped milestone assign endpoint, parent via a `subtask` task relation).
 */
export default function CreateTaskTopbar({
  boardId,
  milestoneId,
  onMilestoneChange,
  parentTaskId,
  onParentTaskChange,
  disabled = false,
}: CreateTaskTopbarProps) {
  const { t } = useTranslation();
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentSearch, setParentSearch] = useState("");

  const { data: milestones = [] } = useGetMilestonesByBoard(boardId);
  const { data: boardData } = useGetTasks(boardId);

  const selectedMilestone = milestones.find(
    (milestone: MilestoneRow) => milestone.id === milestoneId,
  );

  const selectableMilestones = milestones.filter(
    (milestone: MilestoneRow) =>
      milestone.status !== "archived" || milestone.id === milestoneId,
  );

  const boardTasks = useMemo<PickableTask[]>(() => {
    const source = boardData as
      | {
          columns?: Array<{ tasks?: PickableTask[] }>;
          plannedTasks?: PickableTask[];
        }
      | undefined;
    const collected: PickableTask[] = [];
    for (const column of source?.columns ?? []) {
      for (const task of column?.tasks ?? []) {
        if (task?.id) collected.push(task);
      }
    }
    for (const task of source?.plannedTasks ?? []) {
      if (task?.id) collected.push(task);
    }
    return collected;
  }, [boardData]);

  const filteredParents = useMemo(() => {
    const term = parentSearch.trim().toLowerCase();
    if (!term) return boardTasks;
    return boardTasks.filter((task) =>
      task.title?.toLowerCase().includes(term),
    );
  }, [boardTasks, parentSearch]);

  const selectedParent = boardTasks.find((task) => task.id === parentTaskId);

  return (
    <div
      data-testid="create-task-topbar"
      data-slot="create-task-topbar"
      className="flex flex-wrap items-center gap-1.5"
    >
      <Popover open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              data-testid="create-task-milestone-trigger"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:milestone.title")}
              className="h-7 gap-1.5 px-2"
            >
              <Milestone className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-32 truncate text-xs font-medium">
                {selectedMilestone
                  ? selectedMilestone.name
                  : t("tasks:milestone.none")}
              </span>
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              data-testid="create-task-milestone-clear"
              onClick={() => {
                onMilestoneChange(null);
                setMilestoneOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <X className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("tasks:milestone.clear")}</span>
            </button>
            {selectableMilestones.length === 0 && (
              <p
                data-testid="create-task-milestone-empty"
                className="px-2 py-1.5 text-xs text-muted-foreground"
              >
                {t("tasks:milestone.empty")}
              </p>
            )}
            {selectableMilestones.map((milestone: MilestoneRow) => (
              <button
                key={milestone.id}
                type="button"
                data-testid={`create-task-milestone-option-${milestone.id}`}
                onClick={() => {
                  onMilestoneChange(
                    milestone.id === milestoneId ? null : milestone.id,
                  );
                  setMilestoneOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    milestone.id === milestoneId ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{milestone.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={parentOpen} onOpenChange={setParentOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              data-testid="create-task-parent-trigger"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:parentTask.title")}
              className="h-7 gap-1.5 px-2"
            >
              <Workflow className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-40 truncate text-xs font-medium">
                {selectedParent
                  ? selectedParent.title
                  : t("tasks:parentTask.none")}
              </span>
            </Button>
          }
        />
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={parentSearch}
              onChange={(event) => setParentSearch(event.target.value)}
              placeholder={t("tasks:parentTask.searchPlaceholder")}
              aria-label={t("tasks:parentTask.searchPlaceholder")}
              className="h-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              data-testid="create-task-parent-clear"
              onClick={() => {
                onParentTaskChange(null);
                setParentOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <X className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{t("tasks:parentTask.clear")}</span>
            </button>
            {filteredParents.length === 0 && (
              <p
                data-testid="create-task-parent-empty"
                className="px-2 py-1.5 text-xs text-muted-foreground"
              >
                {t("tasks:parentTask.empty")}
              </p>
            )}
            {filteredParents.map((task) => (
              <button
                key={task.id}
                type="button"
                data-testid={`create-task-parent-option-${task.id}`}
                onClick={() => {
                  onParentTaskChange(task.id === parentTaskId ? null : task.id);
                  setParentOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    task.id === parentTaskId ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{task.title}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
