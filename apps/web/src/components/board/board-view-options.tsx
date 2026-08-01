import { LayoutGrid, Rows3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BoardDensity } from "@/components/kanban-board/board-density";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";
import { BOARD_GROUP_BY_VALUES } from "@/hooks/use-task-filters-with-labels-support";
import { cn } from "@/lib/cn";

type BoardViewOptionsProps = {
  groupBy: BoardGroupBy;
  onGroupByChange: (groupBy: BoardGroupBy) => void;
  density: BoardDensity;
  onDensityChange: (density: BoardDensity) => void;
};

const GROUP_BY_LABEL_KEYS: Record<BoardGroupBy, string> = {
  none: "tasks:groupBy.none",
  assignee: "tasks:groupBy.assignee",
  priority: "tasks:groupBy.priority",
  // Not `groupBy.label` — that key is the section heading ("Group by"), so the
  // option itself would have rendered as "Group by" instead of "Label".
  label: "tasks:groupBy.byLabel",
};

/**
 * Compact board-header control: group-by picker + card density toggle.
 * Sits beside the existing search/filter controls rather than introducing a
 * second toolbar.
 */
function BoardViewOptions({
  groupBy,
  onGroupByChange,
  density,
  onDensityChange,
}: BoardViewOptionsProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="h-7 gap-1.5 rounded-md px-2 text-muted-foreground text-xs"
          aria-label={t("tasks:viewOptions.label")}
        >
          <LayoutGrid className="size-3.5" />
          <span className="hidden sm:inline">
            {t("tasks:viewOptions.label")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup
          value={groupBy}
          onValueChange={(value) => onGroupByChange(value as BoardGroupBy)}
        >
          {/* Base UI requires group parts to live inside the group itself:
              a label rendered as a sibling throws MenuGroupContext is missing. */}
          <DropdownMenuLabel>{t("tasks:groupBy.label")}</DropdownMenuLabel>
          {BOARD_GROUP_BY_VALUES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(GROUP_BY_LABEL_KEYS[value])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <div className="px-2 pt-1 pb-1.5">
          <p className="px-1 pb-1.5 text-muted-foreground text-xs">
            {t("tasks:display.label")}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={density === "comfortable" ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={density === "comfortable"}
              onClick={() => onDensityChange("comfortable")}
              className={cn(
                "h-6 flex-1 gap-1.5 rounded-md px-2 text-xs",
                density !== "comfortable" && "text-muted-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" />
              {t("tasks:display.comfortable")}
            </Button>
            <Button
              type="button"
              variant={density === "compact" ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={density === "compact"}
              onClick={() => onDensityChange("compact")}
              className={cn(
                "h-6 flex-1 gap-1.5 rounded-md px-2 text-xs",
                density !== "compact" && "text-muted-foreground",
              )}
            >
              <Rows3 className="size-3.5" />
              {t("tasks:display.compact")}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BoardViewOptions;
