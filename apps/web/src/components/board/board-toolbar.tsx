import { Filter, Search, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import BoardViewOptions from "@/components/board/board-view-options";
import SortControl from "@/components/common/sort-control";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { resolveLabelColor } from "@/constants/label-colors";
import {
  type BoardFilters,
  DUE_DATE_FILTER_VALUES,
} from "@/hooks/use-task-filters";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getColumnIcon } from "@/lib/column";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type { SortConfig } from "@/lib/sort-tasks";
import type { BoardWithTasks } from "@/types/board";

type OrganizationLabel = {
  id: string;
  name: string;
  color: string;
};

type ActiveUsers = {
  members?: Array<{
    userId: string;
    user?: {
      email?: string | null;
      image?: string | null;
      name?: string | null;
    } | null;
  }>;
};

type StatusColumn = {
  id: string;
  name: string;
  isFinal?: boolean | null;
  icon?: string | null;
};

type BoardToolbarProps = {
  board?: BoardWithTasks | null;
  /** Status options when there is no single board (e.g. My Tickets). */
  statusColumns?: StatusColumn[];
  filters: BoardFilters;
  updateFilter: (
    key: keyof BoardFilters,
    value: BoardFilters[keyof BoardFilters],
  ) => void;
  updateLabelFilter: (labelId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  users?: ActiveUsers;
  organizationLabels: OrganizationLabel[];
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
  /**
   * Board search + view options live in this toolbar (#61 rework): the user
   * rejected having them stranded up in the page header, away from Filter and
   * Sort. Timeline keeps every view control on one row; so does this.
   */
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef?: Ref<HTMLInputElement>;
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
  /**
   * Rendered immediately after the search field. List view uses it for the
   * "Ctrl + drag to nest" hint, which previously sat in a second toolbar row
   * below this one.
   */
  searchAdornment?: ReactNode;
  /**
   * Rendered immediately before `actions` (i.e. left of Create ticket). List
   * view uses it for Bulk Actions, previously in that same second row.
   */
  secondaryActions?: ReactNode;
  filtersOnly?: boolean;
  actions?: ReactNode;
};

function CheckSlot({ checked }: { checked: boolean }) {
  return (
    <span
      className={`inline-flex size-4 shrink-0 items-center justify-center rounded-sm border ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      }`}
    >
      {checked ? "✓" : null}
    </span>
  );
}

type ActiveFilterChipProps = {
  subject: string;
  operator: string;
  value: ReactNode;
  onClear: () => void;
};

function ActiveFilterChip({
  subject,
  operator,
  value,
  onClear,
}: ActiveFilterChipProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex h-11 items-center rounded-md border border-border bg-background text-xs shadow-xs sm:h-7">
      <span className="px-2 font-medium text-foreground">{subject}</span>
      <span className="h-full w-px bg-border" />
      <span className="px-2 text-muted-foreground">{operator}</span>
      <span className="h-full w-px bg-border" />
      <span className="flex px-2 text-foreground">{value}</span>
      <span className="h-full w-px bg-border" />
      <button
        aria-label={`${t("common:actions.clear")} ${subject}`}
        className="-my-px inline-flex h-11 w-11 items-center justify-center rounded-r-md sm:my-0 sm:h-full sm:w-7 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
        onClick={onClear}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StackedIcons({
  items,
  itemClassName,
}: {
  items: Array<{ id: string; node: ReactNode }>;
  itemClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <span className="inline-flex items-center -space-x-1.5">
      {items.slice(0, 3).map((item) => (
        <span
          key={item.id}
          className={`inline-flex size-4 items-center justify-center rounded-full bg-background ${itemClassName ?? ""}`}
        >
          {item.node}
        </span>
      ))}
    </span>
  );
}

export default function BoardToolbar({
  board,
  statusColumns,
  filters,
  updateFilter,
  updateLabelFilter,
  clearFilters,
  hasActiveFilters,
  users,
  organizationLabels,
  sort,
  onSortChange,
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  groupBy,
  onGroupByChange,
  searchAdornment,
  secondaryActions,
  filtersOnly = false,
  actions,
}: BoardToolbarProps) {
  const { t } = useTranslation();
  const columns: StatusColumn[] = statusColumns ?? board?.columns ?? [];
  const selectedStatusIds = filters.status ?? [];
  const selectedPriorityIds = filters.priority ?? [];
  const selectedAssigneeIds = filters.assignee ?? [];
  const selectedDueDateFilters = filters.dueDate ?? [];

  const getStatusDisplayName = (statusId: string) => {
    const column = columns.find((col) => col.id === statusId);
    return column?.name || statusId;
  };
  const getStatusIcon = (statusId: string) => {
    const column = columns.find((col) => col.id === statusId);
    return getColumnIcon(statusId, column?.isFinal ?? undefined, column?.icon);
  };

  const getPriorityDisplayName = (priority: string) =>
    getPriorityLabel(priority);

  const getAssigneeDisplayName = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return member?.user?.name || t("common:people.unknown");
  };
  const getAssigneeAvatar = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return (
      <Avatar
        className={`h-4 w-4 ${getAvatarTone(userId, member?.user?.email)}`}
      >
        <AvatarImage
          src={member?.user?.image ?? ""}
          alt={member?.user?.name || ""}
        />
        <AvatarFallback className="bg-transparent border border-border/30 text-xs font-medium">
          {getInitials(member?.user?.name)}
        </AvatarFallback>
      </Avatar>
    );
  };

  const uniqueLabels = organizationLabels.reduce(
    (acc: OrganizationLabel[], label: OrganizationLabel) => {
      const existing = acc.find(
        (l) => l.name === label.name && l.color === label.color,
      );
      if (!existing) acc.push(label);
      return acc;
    },
    [],
  );

  const isLabelGroupSelected = (label: { name: string; color: string }) => {
    return organizationLabels
      .filter((l) => l.name === label.name && l.color === label.color)
      .some((l) => filters.labels?.includes(l.id));
  };

  const toggleStatusFilter = (statusId: string) => {
    const exists = selectedStatusIds.includes(statusId);
    const next = exists
      ? selectedStatusIds.filter((id) => id !== statusId)
      : [...selectedStatusIds, statusId];
    updateFilter("status", next.length > 0 ? next : null);
  };

  const togglePriorityFilter = (priority: string) => {
    const exists = selectedPriorityIds.includes(priority);
    const next = exists
      ? selectedPriorityIds.filter((id) => id !== priority)
      : [...selectedPriorityIds, priority];
    updateFilter("priority", next.length > 0 ? next : null);
  };

  const toggleAssigneeFilter = (userId: string) => {
    const exists = selectedAssigneeIds.includes(userId);
    const next = exists
      ? selectedAssigneeIds.filter((id) => id !== userId)
      : [...selectedAssigneeIds, userId];
    updateFilter("assignee", next.length > 0 ? next : null);
  };

  const toggleDueDateFilter = (dueDate: string) => {
    const exists = selectedDueDateFilters.includes(dueDate);
    const next = exists
      ? selectedDueDateFilters.filter((id) => id !== dueDate)
      : [...selectedDueDateFilters, dueDate];
    updateFilter("dueDate", next.length > 0 ? next : null);
  };

  const toggleLabelGroup = (label: { name: string; color: string }) => {
    const matching = organizationLabels.filter(
      (l) => l.name === label.name && l.color === label.color,
    );
    const anySelected = matching.some((l) => filters.labels?.includes(l.id));

    for (const l of matching) {
      if (
        (anySelected && filters.labels?.includes(l.id)) ||
        (!anySelected && !filters.labels?.includes(l.id))
      ) {
        updateLabelFilter(l.id);
      }
    }
  };

  const clearLabelFilters = () => {
    if (!filters.labels || filters.labels.length === 0) return;
    for (const labelId of filters.labels) updateLabelFilter(labelId);
  };

  return (
    <div
      className={
        filtersOnly
          ? "min-w-0"
          : "border-border/80 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70"
      }
      data-testid={filtersOnly ? "board-filter-controls" : "board-toolbar"}
    >
      <div
        className={
          filtersOnly
            ? "flex min-w-0 items-center"
            : "flex min-h-10 items-center px-2 py-1.5 md:px-3"
        }
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-foreground text-xs font-medium outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:min-h-0"
                  />
                }
              >
                <Filter className="h-3 w-3" />
                {t("common:actions.filter")}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="max-h-[min(28rem,calc(100vh-6rem))] w-56 overflow-y-auto"
                align="start"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs uppercase tracking-wide">
                    {t("tasks:boardFilters.filterBy")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 rounded-md text-sm sm:min-h-0">
                    {t("tasks:boardFilters.subjects.status")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        aria-pressed={selectedStatusIds.length === 0}
                        className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                          selectedStatusIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("status", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedStatusIds.length === 0} />
                        {t("tasks:boardFilters.allStatuses")}
                      </button>
                      {columns.map((column) => (
                        <button
                          key={column.id}
                          aria-pressed={selectedStatusIds.includes(column.id)}
                          className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                            selectedStatusIds.includes(column.id)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleStatusFilter(column.id)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedStatusIds.includes(column.id)}
                          />
                          <span className="inline-flex h-4 w-4 items-center justify-center">
                            {getStatusIcon(column.id)}
                          </span>
                          <span className="truncate">{column.name}</span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 rounded-md text-sm sm:min-h-0">
                    {t("tasks:boardFilters.subjects.priority")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        aria-pressed={selectedPriorityIds.length === 0}
                        className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                          selectedPriorityIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("priority", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedPriorityIds.length === 0} />
                        {t("tasks:boardFilters.allPriorities")}
                      </button>
                      {["urgent", "high", "medium", "low"].map((priority) => (
                        <button
                          key={priority}
                          aria-pressed={selectedPriorityIds.includes(priority)}
                          className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                            selectedPriorityIds.includes(priority)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => togglePriorityFilter(priority)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedPriorityIds.includes(priority)}
                          />
                          <span className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                            {getPriorityIcon(priority)}
                          </span>
                          <span className="truncate capitalize">
                            {getPriorityDisplayName(priority)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 rounded-md text-sm sm:min-h-0">
                    {t("tasks:boardFilters.subjects.assignee")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        aria-pressed={selectedAssigneeIds.length === 0}
                        className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                          selectedAssigneeIds.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("assignee", null)}
                        type="button"
                      >
                        <CheckSlot checked={selectedAssigneeIds.length === 0} />
                        {t("tasks:boardFilters.allAssignees")}
                      </button>
                      {users?.members?.map((member) => (
                        <button
                          key={member.userId}
                          aria-pressed={selectedAssigneeIds.includes(
                            member.userId,
                          )}
                          className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                            selectedAssigneeIds.includes(member.userId)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleAssigneeFilter(member.userId)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedAssigneeIds.includes(
                              member.userId,
                            )}
                          />
                          <span className="inline-flex items-center gap-2">
                            <Avatar
                              className={`h-5 w-5 ${getAvatarTone(member.userId, member.user?.email)}`}
                            >
                              <AvatarImage
                                src={member.user?.image ?? ""}
                                alt={member.user?.name || ""}
                              />
                              <AvatarFallback className="bg-transparent border border-border/30 text-xs font-medium">
                                {getInitials(member.user?.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span>{member.user?.name}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 rounded-md text-sm sm:min-h-0">
                    {t("tasks:boardFilters.subjects.dueDate")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <div className="grid grid-cols-1 gap-1 p-1">
                      <button
                        aria-pressed={selectedDueDateFilters.length === 0}
                        className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                          selectedDueDateFilters.length === 0
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/60 hover:text-foreground"
                        }`}
                        onClick={() => updateFilter("dueDate", null)}
                        type="button"
                      >
                        <CheckSlot
                          checked={selectedDueDateFilters.length === 0}
                        />
                        {t("tasks:boardFilters.allDueDates")}
                      </button>
                      {[
                        DUE_DATE_FILTER_VALUES.dueThisWeek,
                        DUE_DATE_FILTER_VALUES.dueNextWeek,
                        DUE_DATE_FILTER_VALUES.noDueDate,
                      ].map((dueDate) => (
                        <button
                          key={dueDate}
                          aria-pressed={selectedDueDateFilters.includes(
                            dueDate,
                          )}
                          className={`inline-flex h-7 min-h-11 items-center gap-1.5 rounded-md px-2 text-left text-xs sm:min-h-0 ${
                            selectedDueDateFilters.includes(dueDate)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/60 hover:text-foreground"
                          }`}
                          onClick={() => toggleDueDateFilter(dueDate)}
                          type="button"
                        >
                          <CheckSlot
                            checked={selectedDueDateFilters.includes(dueDate)}
                          />
                          {t(
                            `tasks:backlog.filters.${
                              dueDate === DUE_DATE_FILTER_VALUES.dueThisWeek
                                ? "dueThisWeek"
                                : dueDate === DUE_DATE_FILTER_VALUES.dueNextWeek
                                  ? "dueNextWeek"
                                  : "noDueDate"
                            }`,
                          )}
                        </button>
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="h-8 min-h-11 rounded-md text-sm sm:min-h-0">
                    {t("tasks:properties.labels")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <DropdownMenuItem
                      onClick={clearLabelFilters}
                      className="h-8 min-h-11 rounded-md text-sm sm:min-h-0"
                    >
                      <CheckSlot
                        checked={!filters.labels || filters.labels.length === 0}
                      />
                      {t("tasks:boardFilters.allLabels")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {uniqueLabels.length > 0 ? (
                      uniqueLabels.map((label) => (
                        <DropdownMenuItem
                          key={label.id}
                          onClick={() => toggleLabelGroup(label)}
                          className="h-8 min-h-11 rounded-md text-sm sm:min-h-0"
                        >
                          <CheckSlot checked={isLabelGroupSelected(label)} />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: resolveLabelColor(label.color),
                            }}
                          />
                          <span className="max-w-20 truncate">
                            {label.name}
                          </span>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem
                        disabled
                        className="h-8 min-h-11 rounded-md text-sm sm:min-h-0 text-muted-foreground"
                      >
                        {t("tasks:labels.empty")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {hasActiveFilters && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={clearFilters}
                      className="h-8 min-h-11 rounded-md text-sm sm:min-h-0 text-muted-foreground"
                    >
                      {t("common:actions.clearAllFilters")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {!filtersOnly && (
              <SortControl sort={sort} onSortChange={onSortChange} />
            )}
            {!filtersOnly && (
              <BoardViewOptions
                groupBy={groupBy}
                onGroupByChange={onGroupByChange}
              />
            )}

            {!filtersOnly && (
              <div className="relative w-[200px]">
                <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder={t("tasks:boardSearchPlaceholder")}
                  aria-label={t("tasks:boardSearchPlaceholder")}
                  className="h-7 [&_[data-slot=input]]:h-7 [&_[data-slot=input]]:leading-7 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:pr-7 [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:placeholder:text-xs"
                />
                {searchQuery ? (
                  <button
                    aria-label={t("tasks:boardClearSearch")}
                    className="-translate-y-1/2 absolute top-1/2 right-1.5 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => onSearchQueryChange("")}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            )}

            {!filtersOnly && searchAdornment ? (
              <div
                className="shrink-0"
                data-testid="board-toolbar-search-adornment"
              >
                {searchAdornment}
              </div>
            ) : null}

            {selectedStatusIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.status")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedStatusIds.map((statusId) => ({
                        id: statusId,
                        node: getStatusIcon(statusId),
                      }))}
                      itemClassName="[&>svg]:h-3.5 [&>svg]:w-3.5"
                    />
                    <span>
                      {selectedStatusIds.length === 1
                        ? getStatusDisplayName(selectedStatusIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedStatusIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("status", null)}
              />
            )}

            {selectedPriorityIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.priority")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedPriorityIds.map((priority) => ({
                        id: priority,
                        node: getPriorityIcon(priority),
                      }))}
                    />
                    <span>
                      {selectedPriorityIds.length === 1
                        ? getPriorityDisplayName(selectedPriorityIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedPriorityIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("priority", null)}
              />
            )}

            {selectedAssigneeIds.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.assignee")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StackedIcons
                      items={selectedAssigneeIds.map((userId) => ({
                        id: userId,
                        node: getAssigneeAvatar(userId),
                      }))}
                    />
                    <span>
                      {selectedAssigneeIds.length === 1
                        ? getAssigneeDisplayName(selectedAssigneeIds[0])
                        : t("tasks:boardFilters.selectedCount", {
                            count: selectedAssigneeIds.length,
                          })}
                    </span>
                  </span>
                }
                onClear={() => updateFilter("assignee", null)}
              />
            )}

            {selectedDueDateFilters.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.dueDate")}
                operator={t("tasks:boardFilters.operators.isAnyOf")}
                value={
                  selectedDueDateFilters.length === 1
                    ? t(
                        `tasks:backlog.filters.${
                          selectedDueDateFilters[0] ===
                          DUE_DATE_FILTER_VALUES.dueThisWeek
                            ? "dueThisWeek"
                            : selectedDueDateFilters[0] ===
                                DUE_DATE_FILTER_VALUES.dueNextWeek
                              ? "dueNextWeek"
                              : "noDueDate"
                        }`,
                      )
                    : t("tasks:boardFilters.selectedCount", {
                        count: selectedDueDateFilters.length,
                      })
                }
                onClear={() => updateFilter("dueDate", null)}
              />
            )}

            {filters.labels && filters.labels.length > 0 && (
              <ActiveFilterChip
                subject={t("tasks:boardFilters.subjects.labels")}
                operator={t("tasks:boardFilters.operators.includeAnyOf")}
                value={t("tasks:boardFilters.selectedCount", {
                  count: filters.labels.length,
                })}
                onClear={clearLabelFilters}
              />
            )}
          </div>

          {!filtersOnly && (secondaryActions || actions) ? (
            <div
              className="flex shrink-0 items-center gap-2"
              data-testid="board-toolbar-actions"
            >
              {secondaryActions}
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
