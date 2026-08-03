import {
  CalendarDays,
  CircleOff,
  Eye,
  Flag,
  Group,
  LayoutGrid,
  Rows3,
  Tag,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BoardDensity } from "@/components/kanban-board/board-density";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { BOARD_GROUP_BY_VALUES } from "@/hooks/use-task-filters-with-labels-support";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type BoardViewOptionsProps = {
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
  density: BoardDensity;
  onDensityChange: (density: BoardDensity) => void;
};

const GROUP_BY_OPTIONS: Record<
  BoardGroupBy,
  { icon: typeof Group; labelKey: string }
> = {
  none: { icon: CircleOff, labelKey: "tasks:groupBy.none" },
  assignee: { icon: User, labelKey: "tasks:groupBy.assignee" },
  priority: { icon: Flag, labelKey: "tasks:groupBy.priority" },
  label: { icon: Tag, labelKey: "tasks:groupBy.byLabel" },
  dueDate: { icon: CalendarDays, labelKey: "tasks:groupBy.dueDate" },
};

function BoardViewOptions({
  groupBy,
  onGroupByChange,
  density,
  onDensityChange,
}: BoardViewOptionsProps) {
  const { t } = useTranslation();
  const display = useUserPreferencesStore();
  const fields = [
    [
      "tasks:display.taskNumbers",
      display.showTaskNumbers,
      display.toggleTaskNumbers,
    ],
    ["tasks:display.assignee", display.showAssignees, display.toggleAssignees],
    ["tasks:display.dates", display.showDueDates, display.toggleDueDates],
    ["tasks:display.labels", display.showLabels, display.toggleLabels],
    ["tasks:display.priority", display.showPriority, display.togglePriority],
  ] as const;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-medium text-foreground text-xs outline-none ring-0 hover:bg-accent/60"
            type="button"
          >
            <Group className="size-3.5" />
            {t("tasks:groupBy.label")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={groupBy}
            onValueChange={(value) => onGroupByChange(value as BoardGroupBy)}
          >
            {BOARD_GROUP_BY_VALUES.map((value) => {
              const { icon: OptionIcon, labelKey } = GROUP_BY_OPTIONS[value];
              return (
                <DropdownMenuRadioItem key={value} value={value}>
                  <span className="inline-flex items-center gap-2">
                    <OptionIcon className="size-4 text-muted-foreground" />
                    {t(labelKey)}
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-medium text-foreground text-xs outline-none ring-0 hover:bg-accent/60"
            type="button"
          >
            <Eye className="size-3.5" />
            {t("tasks:display.label")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <div className="flex gap-1 px-2 pb-2">
            {(["comfortable", "compact"] as const).map((value) => (
              <Button
                aria-pressed={density === value}
                className={cn(
                  "h-6 flex-1 gap-1.5 px-2 text-xs",
                  density !== value && "text-muted-foreground",
                )}
                key={value}
                onClick={() => onDensityChange(value)}
                size="xs"
                type="button"
                variant={density === value ? "secondary" : "ghost"}
              >
                {value === "comfortable" ? (
                  <LayoutGrid className="size-3.5" />
                ) : (
                  <Rows3 className="size-3.5" />
                )}
                {t(`tasks:display.${value}`)}
              </Button>
            ))}
          </div>
          <DropdownMenuSeparator />
          {fields.map(([label, checked, toggle]) => (
            <DropdownMenuCheckboxItem
              checked={checked}
              key={label}
              onCheckedChange={toggle}
            >
              {t(label)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export default BoardViewOptions;
