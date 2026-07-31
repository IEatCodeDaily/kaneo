import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardToolbar from "@/components/board/board-toolbar";
import BoardViewOptions from "@/components/board/board-view-options";
import BoardLayout from "@/components/common/board-layout";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import KanbanBoard from "@/components/kanban-board";
import {
  type BoardDensity,
  BoardDensityProvider,
} from "@/components/kanban-board/board-density";
import { BoardGroupByProvider } from "@/components/kanban-board/board-view-context";
import ListView from "@/components/list-view";
import PageTitle from "@/components/page-title";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Input } from "@/components/ui/input";
import { shortcuts } from "@/constants/shortcuts";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useBoardSort } from "@/hooks/use-board-sort";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  type BoardGroupBy,
  useTaskFiltersWithLabelsSupport,
} from "@/hooks/use-task-filters-with-labels-support";
import { sortTasks } from "@/lib/sort-tasks";
import useBoardStore from "@/store/board";
import { useUserPreferencesStore } from "@/store/user-preferences";

type BoardSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/board/$boardId/board",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId, organizationId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  // isPlaceholderData is true while the incoming board's tasks are still in
  // flight and react-query is serving the previous board's data (keepPreviousData).
  // Showing the skeleton then means a board switch never displays the OLD
  // board's cards under the NEW board's name.
  const { data, isPlaceholderData } = useGetTasks(boardId);
  const { board, setBoard } = useBoardStore();
  const { viewMode, setViewMode } = useUserPreferencesStore();
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<BoardGroupBy>("none");
  const [density, setDensity] = useState<BoardDensity>("comfortable");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [isBoardSearchMounted, setIsBoardSearchMounted] = useState(false);
  const [isBoardSearchVisible, setIsBoardSearchVisible] = useState(false);
  const [boardSearchInput, setBoardSearchInput] =
    useState<HTMLInputElement | null>(null);
  const { sort, setSort } = useBoardSort(boardId);

  const { data: users } = useGetActiveOrganizationMembers(organizationId);
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: {},
      replace: true,
    });
  }, [navigate]);

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.view.prefix]: {
        [shortcuts.view.board]: () => setViewMode("board"),
        [shortcuts.view.list]: () => setViewMode("list"),
        [shortcuts.view.gantt]: () =>
          navigate({
            to: "/dashboard/organization/$organizationId/board/$boardId/gantt",
            params: { organizationId, boardId },
          }),
        [shortcuts.view.backlog]: () =>
          navigate({
            to: "/dashboard/organization/$organizationId/board/$boardId/backlog",
            params: { organizationId, boardId },
          }),
      },
    },
  });

  useEffect(() => {
    if (data) {
      setBoard(data);
    }
  }, [data, setBoard]);

  const openBoardSearch = useCallback(() => {
    setIsBoardSearchMounted(true);
    window.requestAnimationFrame(() => setIsBoardSearchVisible(true));
  }, []);

  const closeBoardSearch = useCallback(() => {
    setIsBoardSearchVisible(false);
    window.setTimeout(() => setIsBoardSearchMounted(false), 180);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";

      if (!isFindShortcut) return;

      event.preventDefault();
      openBoardSearch();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openBoardSearch]);

  useEffect(() => {
    if (!isBoardSearchMounted) return;
    window.requestAnimationFrame(() => boardSearchInput?.focus());
  }, [isBoardSearchMounted, boardSearchInput]);

  const {
    filters,
    updateFilter,
    updateLabelFilter,
    filteredBoard,
    hasActiveFilters,
    clearFilters,
  } = useTaskFiltersWithLabelsSupport(board, boardId, boardSearchQuery);

  const sortedBoard = useMemo(() => {
    if (!filteredBoard || sort.field === "position") return filteredBoard;
    return {
      ...filteredBoard,
      columns: filteredBoard.columns.map((column) => ({
        ...column,
        tasks: sortTasks(column.tasks, sort),
      })),
    };
  }, [filteredBoard, sort]);

  const boardHeaderSearch = isBoardSearchMounted ? (
    <div
      className={`relative w-[240px] origin-top transition-[translate,scale,opacity] duration-180 ease-out ${
        isBoardSearchVisible
          ? "translate-y-0 scale-y-100 opacity-100"
          : "pointer-events-none -translate-y-1 scale-y-95 opacity-0"
      }`}
    >
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        ref={setBoardSearchInput}
        value={boardSearchQuery}
        onChange={(event) => setBoardSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !boardSearchQuery.trim()) {
            closeBoardSearch();
          }
        }}
        onBlur={() => {
          if (!boardSearchQuery.trim()) {
            closeBoardSearch();
          }
        }}
        placeholder={t("tasks:boardSearchPlaceholder")}
        className="h-7.5 [&_[data-slot=input]]:h-7 [&_[data-slot=input]]:leading-7 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:placeholder:text-xs [&_[data-slot=input]]:placeholder:leading-7"
      />
    </div>
  ) : null;

  const boardHeaderActions = (
    <div className="flex items-center gap-1.5">
      {boardHeaderSearch}
      <BoardViewOptions
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        density={density}
        onDensityChange={setDensity}
      />
    </div>
  );

  return (
    <BoardLayout
      boardId={boardId}
      organizationId={organizationId}
      activeView="board"
      headerActions={boardHeaderActions}
    >
      <PageTitle
        title={`${board?.name} — ${viewMode === "board" ? t("tasks:view.board") : t("tasks:view.list")}`}
        hideAppName
      />
      {/* Keyed by board so the content fades in on every board switch. Without
          the key React reuses this subtree across boards, and `starting:`
          styles only apply on first mount — so switching boards swapped the
          cards in with no transition at all. */}
      <div
        key={boardId}
        className="relative flex flex-col h-full min-h-0 overflow-hidden transition-opacity duration-200 ease-out starting:opacity-0"
      >
        <BoardToolbar
          board={board}
          filters={filters}
          updateFilter={updateFilter}
          updateLabelFilter={updateLabelFilter}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          users={users}
          organizationLabels={organizationLabels}
          viewMode={viewMode}
          setViewMode={setViewMode}
          sort={sort}
          onSortChange={setSort}
        />

        <div className="flex h-full flex-1 overflow-hidden bg-background">
          {sortedBoard && !isPlaceholderData ? (
            <BoardGroupByProvider groupBy={groupBy}>
              <BoardDensityProvider density={density}>
                {viewMode === "board" ? (
                  <KanbanBoard
                    board={sortedBoard}
                    disableDragDrop={sort.field !== "position"}
                  />
                ) : (
                  <ListView
                    board={sortedBoard}
                    disableDragDrop={sort.field !== "position"}
                  />
                )}
              </BoardDensityProvider>
            </BoardGroupByProvider>
          ) : (
            <BoardSkeleton />
          )}
        </div>

        <CreateTaskModal
          open={isTaskModalOpen}
          boardId={boardId}
          onClose={() => setIsTaskModalOpen(false)}
        />

        <TaskDetailsSheet
          taskId={taskId}
          boardId={boardId}
          organizationId={organizationId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </BoardLayout>
  );
}
