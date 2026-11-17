import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/common/toolbar-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { SortConfig, SortDirection, SortField } from "@/lib/sort-tasks";

type SortControlProps = {
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
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
      {checked ? "\u2713" : null}
    </span>
  );
}

export default function SortControl({ sort, onSortChange }: SortControlProps) {
  const { t } = useTranslation();
  const sortFields: { field: SortField; label: string }[] = [
    { field: "position", label: t("tasks:sort.fields.position") },
    { field: "createdAt", label: t("tasks:sort.fields.createdAt") },
    { field: "priority", label: t("tasks:sort.fields.priority") },
    { field: "dueDate", label: t("tasks:sort.fields.dueDate") },
    { field: "title", label: t("tasks:sort.fields.title") },
    { field: "number", label: t("tasks:sort.fields.number") },
  ];
  const isActive = sort.field !== "position";
  const activeLabel = sortFields.find((f) => f.field === sort.field)?.label;

  const handleFieldChange = (field: SortField) => {
    if (field === "position" || field === sort.field) {
      onSortChange({ field: "position", direction: "asc" });
    } else {
      const defaultDirection: SortDirection =
        field === "priority" ? "desc" : "asc";
      onSortChange({ field, direction: defaultDirection });
    }
  };

  const toggleDirection = () => {
    onSortChange({
      ...sort,
      direction: sort.direction === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div className="inline-flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              icon={
                sort.direction === "asc" ? (
                  <ArrowUpAZ className="size-3.5" />
                ) : (
                  <ArrowDownAZ className="size-3.5" />
                )
              }
              label={
                isActive
                  ? (activeLabel ?? t("tasks:sort.label"))
                  : t("tasks:sort.label")
              }
              applied={isActive}
            />
          }
        />
        <DropdownMenuContent className="w-48" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs uppercase tracking-wide">
              {t("tasks:sort.by")}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {sortFields.map(({ field, label }) => (
            <DropdownMenuItem
              key={field}
              onClick={() => handleFieldChange(field)}
              className="h-8 rounded-md text-sm"
            >
              <CheckSlot checked={sort.field === field} />
              {label}
            </DropdownMenuItem>
          ))}

          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs uppercase tracking-wide">
                  {t("tasks:sort.direction")}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => onSortChange({ ...sort, direction: "asc" })}
                className="h-8 rounded-md text-sm"
              >
                <CheckSlot checked={sort.direction === "asc"} />
                {t("tasks:sort.ascending")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSortChange({ ...sort, direction: "desc" })}
                className="h-8 rounded-md text-sm"
              >
                <CheckSlot checked={sort.direction === "desc"} />
                {t("tasks:sort.descending")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isActive && (
        <ToolbarButton
          iconOnly
          onClick={toggleDirection}
          label={
            sort.direction === "asc"
              ? t("tasks:sort.ascending")
              : t("tasks:sort.descending")
          }
          icon={
            sort.direction === "asc" ? (
              <ArrowUpAZ className="size-3.5" />
            ) : (
              <ArrowDownAZ className="size-3.5" />
            )
          }
        />
      )}
    </div>
  );
}
