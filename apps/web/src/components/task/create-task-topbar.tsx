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
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";
import {
  buildParentOptions,
  formatParentLabel,
  type ParentOption,
} from "./parent-task-options";

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

  /*
   * #154: parents may live on other boards, so once the user types we also
   * query the organization-wide search. Skipped while the query is empty —
   * the board's own tickets are the sensible default.
   */
  const { data: activeOrganization } = useActiveOrganization();
  const { data: searchData } = useGlobalSearch({
    q: parentSearch.trim().length > 1 ? parentSearch.trim() : "",
    type: "tasks",
    // The API requires an organization scope; without it the request 400s and
    // no cross-board results ever arrive.
    organizationId: activeOrganization?.id,
    limit: 20,
  });

  const [pinnedParent, setPinnedParent] = useState<ParentOption | null>(null);

  const parentOptions = useMemo(
    () =>
      buildParentOptions({
        boardTasks,
        searchResults: searchData?.results ?? [],
        selectedId: parentTaskId,
        selectedOption: pinnedParent,
        query: parentSearch,
        currentBoardId: boardId,
      }),
    [boardTasks, searchData, parentTaskId, pinnedParent, parentSearch, boardId],
  );

  const selectedParent =
    parentOptions.find((option) => option.id === parentTaskId) ?? null;

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
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:milestone.title")}
              className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
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
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={t("tasks:parentTask.title")}
              className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            >
              <Workflow className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-40 truncate text-xs font-medium">
                {selectedParent
                  ? formatParentLabel(selectedParent)
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
            {parentOptions.length === 0 && (
              <p
                data-testid="create-task-parent-empty"
                className="px-2 py-1.5 text-xs text-muted-foreground"
              >
                {t("tasks:parentTask.empty")}
              </p>
            )}
            {parentOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`create-task-parent-option-${option.id}`}
                data-cross-board={option.crossBoard ? "true" : "false"}
                onClick={() => {
                  const next = option.id === parentTaskId ? null : option.id;
                  // Remember the choice so a cross-board parent stays pinned
                  // once the search query is cleared and it drops out of the
                  // result set.
                  setPinnedParent(next ? option : null);
                  onParentTaskChange(next);
                  setParentOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    option.id === parentTaskId ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{formatParentLabel(option)}</span>
                {option.crossBoard && option.boardSlug && (
                  <span className="ms-auto shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    {option.boardSlug}
                  </span>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
