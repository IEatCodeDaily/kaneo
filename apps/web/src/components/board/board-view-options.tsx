import {
  CalendarDays,
  CircleOff,
  Eye,
  Flag,
  Group,
  Milestone,
  Rows3,
  Tag,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/common/toolbar-button";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { BOARD_GROUP_BY_VALUES } from "@/hooks/use-task-filters-with-labels-support";

import { useUserPreferencesStore } from "@/store/user-preferences";

type BoardViewOptionsProps = {
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
};

const GROUP_BY_OPTIONS: Record<
  BoardGroupBy,
  { icon: typeof Group; labelKey: string }
> = {
  none: { icon: CircleOff, labelKey: "tasks:groupBy.none" },
  status: { icon: Rows3, labelKey: "tasks:groupBy.status" },
  assignee: { icon: User, labelKey: "tasks:groupBy.assignee" },
  priority: { icon: Flag, labelKey: "tasks:groupBy.priority" },
  label: { icon: Tag, labelKey: "tasks:groupBy.byLabel" },
  dueDate: { icon: CalendarDays, labelKey: "tasks:groupBy.dueDate" },
  milestone: { icon: Milestone, labelKey: "tasks:groupBy.milestone" },
};

function BoardViewOptions({ groupBy, onGroupByChange }: BoardViewOptionsProps) {
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
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              icon={<Group className="size-3.5" />}
              label={t("tasks:groupBy.label")}
              applied={groupBy !== "none"}
            />
          }
        />
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
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              icon={<Eye className="size-3.5" />}
              label={t("tasks:display.label")}
            />
          }
        />
        <DropdownMenuContent align="start" className="w-52">
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
