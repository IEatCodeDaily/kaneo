import {
  ArrowUpDown,
  Download,
  Eye,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import {
  type ColumnSort,
  type DataTableFilter,
  type Density,
  defaultFilterFor,
} from "@/components/data-table/data-table-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { DataTableField } from "@/types/data-table";

/**
 * Design v3 table toolbar (DS §2 "Toolbar button"): ghost at rest,
 * `bg-primary-soft` + count when the view is narrowed, `bg-secondary` while
 * its popover is open. One primary action (New row) at the right end; rare
 * actions live in the overflow menu.
 */
function ToolbarButton({
  icon,
  label,
  badge,
  applied,
  ...props
}: {
  icon: ReactNode;
  label: string;
  badge?: string | number;
  applied?: boolean;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "gap-1.5 px-2 font-normal data-popup-open:bg-secondary",
        applied &&
          "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft data-popup-open:bg-primary-soft data-popup-open:ring-1 data-popup-open:ring-input",
      )}
      {...props}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="rounded-sm bg-primary-soft px-1.5 text-xs tabular-nums">
          {badge}
        </span>
      )}
    </Button>
  );
}

type Props = {
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  hidden: string[];
  onHiddenChange: (ids: string[]) => void;
  filters: DataTableFilter[];
  onFiltersChange: (filters: DataTableFilter[]) => void;
  sort: ColumnSort | null;
  onSortChange: (sort: ColumnSort | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  canEdit: boolean;
  rowsInView: number;
  onAddRow: () => void;
  onAddField: () => void;
  onImport: () => void;
  onExport: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function DataTableToolbar(props: Props) {
  const { t } = useTranslation();
  const {
    fields,
    hidden,
    filters,
    sort,
    search,
    density,
    canEdit,
    rowsInView,
  } = props;
  const hiddenCount = fields.filter((f) => hidden.includes(f.id)).length;
  const sortField = sort ? fields.find((f) => f.id === sort.fieldId) : null;

  return (
    <>
      {/* Fields */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={<SlidersHorizontal className="size-3.5" />}
              label={t("navigation:tables.fields")}
              applied={hiddenCount > 0}
              badge={
                hiddenCount > 0
                  ? t("navigation:tables.hiddenCount", { count: hiddenCount })
                  : undefined
              }
            />
          }
        />
        <PopoverContent align="start" className="w-70 p-0">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.fieldsShown", {
              shown: fields.length - hiddenCount,
              total: fields.length,
            })}
          </p>
          <div className="flex max-h-72 flex-col overflow-y-auto p-1">
            {fields.map((field, index) => {
              // The first field names the row; it can't be hidden.
              const locked = index === 0;
              const visible = !hidden.includes(field.id);
              return (
                <div
                  key={field.id}
                  className="flex h-7 items-center gap-2 rounded-md px-2 text-ui hover:bg-accent"
                >
                  <FieldTypeIcon
                    type={field.type}
                    className="text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{field.name}</span>
                  <Switch
                    checked={visible}
                    disabled={locked}
                    aria-label={field.name}
                    onCheckedChange={(next) =>
                      props.onHiddenChange(
                        next
                          ? hidden.filter((id) => id !== field.id)
                          : [...hidden, field.id],
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t p-1">
            {canEdit ? (
              <Button variant="ghost" size="sm" onClick={props.onAddField}>
                <Plus className="size-3.5" />
                {t("navigation:tables.newField")}
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={hiddenCount === 0}
              onClick={() => props.onHiddenChange([])}
            >
              <Eye className="size-3.5" />
              {t("navigation:tables.showAll")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Filter */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={<ListFilter className="size-3.5" />}
              label={t("common:actions.filter")}
              applied={filters.length > 0}
              badge={filters.length > 0 ? filters.length : undefined}
            />
          }
        />
        <PopoverContent align="start" className="w-137 p-0">
          <FilterRows {...props} />
        </PopoverContent>
      </Popover>

      {/* Sort */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={<ArrowUpDown className="size-3.5" />}
              label={t("navigation:tables.sort")}
              applied={sort !== null}
              badge={sort ? 1 : undefined}
            />
          }
        />
        <PopoverContent align="start" className="w-100 p-0">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.sortBy")}
          </p>
          <div className="flex items-center gap-1 px-2 pb-2">
            <FieldSelect
              fields={fields}
              value={sort?.fieldId ?? ""}
              placeholder={t("navigation:tables.pickField")}
              onChange={(fieldId) =>
                props.onSortChange({ fieldId, dir: sort?.dir ?? "asc" })
              }
            />
            <Select
              value={sort?.dir ?? "asc"}
              disabled={!sort}
              onValueChange={(dir) =>
                sort &&
                props.onSortChange({
                  fieldId: sort.fieldId,
                  dir: dir === "desc" ? "desc" : "asc",
                })
              }
            >
              <SelectTrigger size="sm" className="w-36 min-w-0">
                <SelectValue>
                  {t(
                    sort?.dir === "desc"
                      ? "navigation:tables.sortDescShort"
                      : "navigation:tables.sortAscShort",
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">
                  {t("navigation:tables.sortAscShort")}
                </SelectItem>
                <SelectItem value="desc">
                  {t("navigation:tables.sortDescShort")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!sort}
              aria-label={t("navigation:tables.clearSort")}
              onClick={() => props.onSortChange(null)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {sortField === null && sort !== null && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              {t("navigation:tables.sortFieldGone")}
            </p>
          )}
        </PopoverContent>
      </Popover>

      <span className="flex-1" />

      <div className="flex h-7 w-50 items-center gap-1.5 rounded-md border border-input px-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          unstyled
          value={search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={t("navigation:tables.searchRowsShort")}
          aria-label={t("navigation:tables.searchRowsShort")}
          className="[&_[data-slot=input]]:h-6 [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-ui"
        />
        {search && (
          <button
            type="button"
            aria-label={t("common:actions.clear")}
            className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => props.onSearchChange("")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Overflow: rare actions (DS rule 5) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="data-popup-open:bg-secondary"
              aria-label={t("navigation:tables.tableOptions")}
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            {canEdit && (
              <DropdownMenuItem onClick={props.onImport}>
                <Upload className="size-3.5" />
                {t("navigation:tables.importCsv")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={props.onExport}>
              <Download className="size-3.5" />
              {t("navigation:tables.exportCsv")}
              <span className="ms-auto text-xs text-muted-foreground">
                {t("navigation:tables.exportHint", { count: rowsInView })}
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">
              {t("navigation:tables.rowHeight")}
            </DropdownMenuLabel>
            {(["compact", "comfortable"] as Density[]).map((option) => (
              <DropdownMenuCheckboxItem
                key={option}
                checked={density === option}
                onCheckedChange={() => props.onDensityChange(option)}
              >
                {t(
                  option === "compact"
                    ? "navigation:tables.densityCompact"
                    : "navigation:tables.densityComfortable",
                )}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={props.onRename}>
                  <Pencil className="size-3.5" />
                  {t("navigation:tables.renameTable")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-destructive-foreground data-highlighted:text-destructive-foreground"
                  onClick={props.onDelete}
                >
                  <Trash2 className="size-3.5" />
                  {t("navigation:tables.deleteTable")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEdit && (
        <Button size="sm" onClick={props.onAddRow}>
          <Plus className="size-3.5" />
          {t("navigation:tables.newRow")}
        </Button>
      )}
    </>
  );
}

function FieldSelect({
  fields,
  value,
  placeholder,
  onChange,
}: {
  fields: DataTableField[];
  value: string;
  placeholder: string;
  onChange: (fieldId: string) => void;
}) {
  const current = fields.find((f) => f.id === value);
  return (
    <Select
      value={value || null}
      onValueChange={(next) => next && onChange(String(next))}
    >
      <SelectTrigger size="sm" className="w-40 min-w-0">
        <SelectValue placeholder={placeholder}>
          {current && (
            <span className="flex min-w-0 items-center gap-1.5">
              <FieldTypeIcon
                type={current.type}
                className="text-muted-foreground"
              />
              <span className="truncate">{current.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {fields.map((field) => (
          <SelectItem key={field.id} value={field.id}>
            <span className="flex min-w-0 items-center gap-1.5">
              <FieldTypeIcon
                type={field.type}
                className="text-muted-foreground"
              />
              <span className="truncate">{field.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Stacked condition rows on one grid: word · field · value · trash (DS §2). */
function FilterRows({
  fields,
  members,
  filters,
  onFiltersChange,
}: Pick<Props, "fields" | "members" | "filters" | "onFiltersChange">) {
  const { t } = useTranslation();
  const update = (id: string, next: DataTableFilter) =>
    onFiltersChange(filters.map((f) => (f.id === id ? next : f)));

  return (
    <>
      <div className="flex flex-col gap-1 p-2">
        {filters.length === 0 && (
          <p className="px-1 py-1.5 text-xs text-muted-foreground">
            {t("navigation:tables.noFilters")}
          </p>
        )}
        {filters.map((filter, index) => {
          const field = fields.find((f) => f.id === filter.fieldId);
          return (
            <div
              key={filter.id}
              className="grid grid-cols-[48px_160px_1fr_28px] items-center gap-1"
            >
              <span className="px-1 text-xs text-muted-foreground">
                {index === 0
                  ? t("navigation:tables.where")
                  : t("navigation:tables.and")}
              </span>
              <FieldSelect
                fields={fields}
                value={filter.fieldId}
                placeholder={t("navigation:tables.pickField")}
                onChange={(fieldId) => {
                  const next = fields.find((f) => f.id === fieldId);
                  if (next)
                    update(filter.id, {
                      ...defaultFilterFor(next),
                      id: filter.id,
                    });
                }}
              />
              {field ? (
                <FilterValue
                  filter={filter}
                  field={field}
                  members={members}
                  onChange={(next) => update(filter.id, next)}
                />
              ) : (
                <span />
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("navigation:tables.removeFilter")}
                onClick={() =>
                  onFiltersChange(filters.filter((f) => f.id !== filter.id))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t p-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={fields.length === 0}
          onClick={() =>
            fields[0] &&
            onFiltersChange([...filters, defaultFilterFor(fields[0])])
          }
        >
          <Plus className="size-3.5" />
          {t("navigation:tables.addFilter")}
        </Button>
        <span className="flex items-center gap-2">
          {filters.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {t("navigation:tables.matchAll")}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={filters.length === 0}
            onClick={() => onFiltersChange([])}
          >
            {t("navigation:tables.clearFilters")}
          </Button>
        </span>
      </div>
    </>
  );
}

function FilterValue({
  filter,
  field,
  members,
  onChange,
}: {
  filter: DataTableFilter;
  field: DataTableField;
  members: Map<string, MemberOption>;
  onChange: (next: DataTableFilter) => void;
}) {
  const { t } = useTranslation();
  const input = (props: React.ComponentProps<typeof Input>) => (
    <Input size="sm" className="min-w-0" {...props} />
  );

  if ("contains" in filter) {
    return input({
      value: filter.contains,
      placeholder: t("navigation:tables.contains"),
      "aria-label": field.name,
      onChange: (e) => onChange({ ...filter, contains: e.target.value }),
    });
  }
  if ("min" in filter) {
    return (
      <span className="grid grid-cols-2 gap-1">
        {input({
          type: "number",
          value: filter.min,
          placeholder: t("navigation:tables.optionMin"),
          "aria-label": t("navigation:tables.optionMin"),
          onChange: (e) => onChange({ ...filter, min: e.target.value }),
        })}
        {input({
          type: "number",
          value: filter.max,
          placeholder: t("navigation:tables.optionMax"),
          "aria-label": t("navigation:tables.optionMax"),
          onChange: (e) => onChange({ ...filter, max: e.target.value }),
        })}
      </span>
    );
  }
  if ("from" in filter) {
    return (
      <span className="grid grid-cols-2 gap-1">
        {input({
          type: "date",
          value: filter.from,
          "aria-label": t("navigation:tables.optionMin"),
          onChange: (e) => onChange({ ...filter, from: e.target.value }),
        })}
        {input({
          type: "date",
          value: filter.to,
          "aria-label": t("navigation:tables.optionMax"),
          onChange: (e) => onChange({ ...filter, to: e.target.value }),
        })}
      </span>
    );
  }
  const options =
    "checked" in filter
      ? [
          { id: "any", label: t("navigation:tables.anyValue") },
          { id: "true", label: t("navigation:dashboards.yes") },
          { id: "false", label: t("navigation:dashboards.no") },
        ]
      : [
          { id: "__empty__", label: t("navigation:tables.unassigned") },
          ...(field.type === "user"
            ? Array.from(members.entries()).map(([id, m]) => ({
                id,
                label: m.user.name || m.user.email || id,
              }))
            : (field.options?.choices ?? []).map((c) => ({
                id: c.id,
                label: c.label,
              }))),
        ];
  const value = "checked" in filter ? filter.checked : filter.choiceId;
  return (
    <Select
      value={value || null}
      onValueChange={(next) => {
        const v = String(next ?? "");
        onChange(
          "checked" in filter
            ? { ...filter, checked: v === "true" || v === "false" ? v : "any" }
            : { ...filter, choiceId: v },
        );
      }}
    >
      <SelectTrigger size="sm" className="min-w-0">
        <SelectValue placeholder={t("navigation:tables.selectChoice")}>
          {options.find((o) => o.id === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One 24px chip per applied filter in the condition row (DS §1.4). */
export function FilterConditionChip({
  filter,
  field,
  members,
  onRemove,
}: {
  filter: DataTableFilter;
  field: DataTableField;
  members: Map<string, MemberOption>;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  let summary = "";
  if ("contains" in filter) summary = `“${filter.contains}”`;
  else if ("min" in filter)
    summary = [filter.min && `≥ ${filter.min}`, filter.max && `≤ ${filter.max}`]
      .filter(Boolean)
      .join(" · ");
  else if ("from" in filter)
    summary = [filter.from, filter.to].filter(Boolean).join(" – ");
  else if ("checked" in filter)
    summary =
      filter.checked === "true"
        ? t("navigation:dashboards.yes")
        : t("navigation:dashboards.no");
  else
    summary =
      filter.choiceId === "__empty__"
        ? t("navigation:tables.unassigned")
        : field.type === "user"
          ? (members.get(filter.choiceId)?.user.name ?? filter.choiceId)
          : (field.options?.choices?.find((c) => c.id === filter.choiceId)
              ?.label ?? filter.choiceId);

  return (
    <span className="inline-flex h-6 items-center rounded-md border border-input text-xs">
      <span className="flex items-center gap-1.5 px-2 font-medium">
        <FieldTypeIcon type={field.type} className="text-muted-foreground" />
        {field.name}
      </span>
      <span className="h-full w-px bg-border" />
      <span className="max-w-48 truncate px-2 text-muted-foreground">
        {summary}
      </span>
      <span className="h-full w-px bg-border" />
      <button
        type="button"
        aria-label={t("navigation:tables.removeFilterNamed", {
          name: field.name,
        })}
        className="flex h-full w-6 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
