import {
  ArrowUpDown,
  Download,
  Eye,
  Globe,
  ListFilter,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Rows3,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { ToolbarSearch } from "@/components/common/toolbar-search";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import {
  type ColumnSort,
  DENSITY_LABEL_KEYS,
  type Density,
  isGroupable,
  isQueryable,
} from "@/components/data-table/data-table-format";
import { Button } from "@/components/ui/button";
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
import type { DataTableField, FilterGroup } from "@/types/data-table";
import {
  conditionActive,
  FilterBuilder,
  filterConditions,
} from "./filter-builder";

type Props = {
  fields: DataTableField[];
  onFieldOrderChange?: (ids: string[]) => void;
  members: Map<string, MemberOption>;
  hidden: string[];
  showSystemFields?: boolean;
  onShowSystemFieldsChange?: (show: boolean) => void;
  onHiddenChange: (ids: string[]) => void;
  filterOpen?: boolean;
  onFilterOpenChange?: (open: boolean) => void;
  filters: FilterGroup;
  onFiltersChange: (filters: FilterGroup) => void;
  sort: ColumnSort[];
  onSortChange: (sorts: ColumnSort[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  groupFieldId: string | null;
  onGroupChange: (fieldId: string | null) => void;
  summariesActive: boolean;
  onSummariesToggle: () => void;
  canEdit: boolean;
  rowsInView: number;
  onAddRow: () => void;
  onAddField: () => void;
  onImport: () => void;
  onExport: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPublicForm?: () => void;
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
    groupFieldId,
    summariesActive,
  } = props;
  const queryableFields = fields.filter(isQueryable);
  const groupableFields = fields.filter(isGroupable);
  // Field reorder (S5): drag or Move left/right; focus follows the moved field.
  const dragId = useRef<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const orderable = fields.filter((field) => !field.system);
  const reorder = (from: number, to: number, dir: "left" | "right") => {
    if (!props.onFieldOrderChange || to < 0 || to >= orderable.length) return;
    const ids = orderable.map((f) => f.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setFocusField(`${moved}:${dir}`);
    props.onFieldOrderChange(ids);
  };
  useLayoutEffect(() => {
    if (!focusField) return;
    const [id, dir] = focusField.split(":");
    const primary = document.querySelector<HTMLButtonElement>(
      `[data-field-move="${id}:${dir}"]`,
    );
    const fallback = document.querySelector<HTMLButtonElement>(
      `[data-field-move="${id}:${dir === "left" ? "right" : "left"}"]`,
    );
    (primary && !primary.disabled ? primary : fallback)?.focus();
    setFocusField(null);
  }, [focusField]);
  // The primary field is always visible, so it never counts as hidden.
  const hiddenCount = fields.filter(
    (f, i) => i > 0 && hidden.includes(f.id),
  ).length;
  // Draft rows without a value don't narrow anything, so they don't count.
  const activeCount = filterConditions(filters).filter(conditionActive).length;
  const moveSort = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= sort.length) return;
    const next = [...sort];
    [next[index], next[to]] = [next[to], next[index]];
    props.onSortChange(next);
  };
  const addSort = () => {
    const used = new Set(sort.map((rule) => rule.fieldId));
    const next = queryableFields.find((field) => !used.has(field.id));
    if (next) props.onSortChange([...sort, { fieldId: next.id, dir: "asc" }]);
  };
  const canAddSort =
    sort.length < 5 &&
    queryableFields.some(
      (field) => !sort.some((rule) => rule.fieldId === field.id),
    );
  const sortFieldGone = sort.some(
    (rule) => !fields.some((field) => field.id === rule.fieldId),
  );

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
        <PopoverContent align="start" className="w-70">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.fieldsShown", {
              shown: orderable.length - hiddenCount,
              total: orderable.length,
            })}
          </p>
          <ul className="flex max-h-72 list-none flex-col overflow-y-auto p-1">
            {orderable.map((field, index) => {
              // The first field names the row; it can't be hidden.
              const locked = index === 0;
              const visible = locked || !hidden.includes(field.id);
              return (
                <li
                  key={field.id}
                  draggable={props.onFieldOrderChange !== undefined}
                  onDragStart={(event) => {
                    dragId.current = field.id;
                    event.dataTransfer.setData("text/plain", field.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    if (dragId.current) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = orderable.findIndex(
                      (f) => f.id === dragId.current,
                    );
                    if (from >= 0 && from !== index)
                      reorder(from, index, "left");
                    dragId.current = null;
                  }}
                  onDragEnd={() => {
                    dragId.current = null;
                  }}
                  className="flex h-7 cursor-grab items-center gap-2 rounded-md px-2 text-ui hover:bg-accent"
                >
                  <FieldTypeIcon
                    type={field.type}
                    className="text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{field.name}</span>
                  {props.onFieldOrderChange && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        data-field-move={`${field.id}:left`}
                        aria-label={t("navigation:tables.savedViews.moveLeft", {
                          name: field.name,
                        })}
                        disabled={index === 0}
                        onClick={() => reorder(index, index - 1, "left")}
                      >
                        ←
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        data-field-move={`${field.id}:right`}
                        aria-label={t(
                          "navigation:tables.savedViews.moveRight",
                          { name: field.name },
                        )}
                        disabled={index === orderable.length - 1}
                        onClick={() => reorder(index, index + 1, "right")}
                      >
                        →
                      </Button>
                    </>
                  )}
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
                </li>
              );
            })}
          </ul>
          <div className="flex h-8 items-center gap-2 border-t px-3 text-ui">
            <LockKeyhole className="size-3.5 text-muted-foreground" />
            <span className="flex-1">
              {t("navigation:tables.showSystemFields")}
            </span>
            <Switch
              checked={props.showSystemFields ?? false}
              aria-label={t("navigation:tables.showSystemFields")}
              onCheckedChange={props.onShowSystemFieldsChange}
            />
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
      <Popover open={props.filterOpen} onOpenChange={props.onFilterOpenChange}>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={
                <>
                  <ListFilter className="size-3.5" />
                  {activeCount > 0 && (
                    <span className="text-xs tabular-nums @3xl/toolbar:hidden">
                      {activeCount}
                    </span>
                  )}
                </>
              }
              label={t("common:actions.filter")}
              applied={activeCount > 0}
              badge={activeCount > 0 ? activeCount : undefined}
            />
          }
        />
        <PopoverContent align="start" inset="panel" className="w-120">
          <FilterBuilder
            {...props}
            fields={fields.filter(
              (field) =>
                !field.options?.unavailable &&
                // Lookup resolves only on reads; the query API rejects filters.
                field.type !== "lookup",
            )}
          />
        </PopoverContent>
      </Popover>

      {/* Sort */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={<ArrowUpDown className="size-3.5" />}
              label={t("navigation:tables.sort")}
              applied={sort.length > 0}
              badge={sort.length > 0 ? sort.length : undefined}
            />
          }
        />
        <PopoverContent align="start" className="w-100">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.sortBy")}
          </p>
          {sort.length === 0 && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              {t("navigation:tables.noSorts")}
            </p>
          )}
          <div className="flex flex-col gap-1 px-2 pb-2">
            {sort.map((rule, index) => (
              <div key={rule.fieldId} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground"
                >
                  {index + 1}
                </span>
                <FieldSelect
                  fields={queryableFields}
                  value={rule.fieldId}
                  placeholder={t("navigation:tables.pickField")}
                  className="w-36 min-w-0"
                  onChange={(fieldId) =>
                    // A field sorts once: picking an already-sorted field swaps the two rules.
                    props.onSortChange(
                      sort.map((r, i) => {
                        if (i === index) return { ...r, fieldId };
                        if (r.fieldId === fieldId)
                          return { ...r, fieldId: rule.fieldId };
                        return r;
                      }),
                    )
                  }
                />
                <Select
                  value={rule.dir}
                  onValueChange={(dir) =>
                    props.onSortChange(
                      sort.map((r, i) =>
                        i === index
                          ? { ...r, dir: dir === "desc" ? "desc" : "asc" }
                          : r,
                      ),
                    )
                  }
                >
                  <SelectTrigger size="sm" className="w-28 min-w-0">
                    <SelectValue>
                      {t(
                        rule.dir === "desc"
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
                  size="icon-xs"
                  disabled={index === 0}
                  aria-label={t("navigation:tables.moveSortUp")}
                  onClick={() => moveSort(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === sort.length - 1}
                  aria-label={t("navigation:tables.moveSortDown")}
                  onClick={() => moveSort(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("navigation:tables.removeSort")}
                  onClick={() =>
                    props.onSortChange(sort.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canAddSort}
              onClick={addSort}
            >
              <Plus className="size-3.5" />
              {t("navigation:tables.addSort")}
            </Button>
          </div>
          {sortFieldGone && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              {t("navigation:tables.sortFieldGone")}
            </p>
          )}
        </PopoverContent>
      </Popover>

      {/* Group (single level; S3) */}
      <Popover>
        <PopoverTrigger
          render={
            <ToolbarButton
              icon={<Rows3 className="size-3.5" />}
              label={t("navigation:tables.group")}
              applied={groupFieldId !== null}
              badge={groupFieldId ? 1 : undefined}
            />
          }
        />
        <PopoverContent align="start" className="w-70">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.groupBy")}
          </p>
          <div className="flex items-center gap-1 px-2 pb-2">
            <FieldSelect
              fields={groupableFields}
              value={groupFieldId ?? ""}
              placeholder={t("navigation:tables.pickField")}
              onChange={(fieldId) => props.onGroupChange(fieldId)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!groupFieldId}
              aria-label={t("navigation:tables.clearGroup")}
              onClick={() => props.onGroupChange(null)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          {groupableFields.length === 0 && (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              {t("navigation:tables.noGroupableFields")}
            </p>
          )}
        </PopoverContent>
      </Popover>

      <span className="flex-1" />

      <ToolbarSearch
        label={t("navigation:tables.searchRowsShort")}
        clearLabel={t("common:actions.clear")}
        value={search}
        onChange={props.onSearchChange}
      />

      {/* Overflow: rare actions (DS rule 5) */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <ToolbarButton
              iconOnly
              icon={<MoreHorizontal className="size-3.5" />}
              label={t("navigation:tables.tableOptions")}
            />
          }
        />
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
            {(["compact", "comfortable", "tall", "extra"] as Density[]).map(
              (option) => (
                <DropdownMenuCheckboxItem
                  key={option}
                  checked={density === option}
                  onCheckedChange={() => props.onDensityChange(option)}
                >
                  {t(DENSITY_LABEL_KEYS[option])}
                </DropdownMenuCheckboxItem>
              ),
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuCheckboxItem
              checked={summariesActive}
              onCheckedChange={props.onSummariesToggle}
            >
              {t("navigation:tables.fieldSummaries")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          {canEdit && props.onPublicForm && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={props.onPublicForm}>
                  <Globe className="size-3.5" />
                  {t("navigation:tables.publicForm")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
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
        <ToolbarButton
          variant="default"
          data-toolbar-primary=""
          onClick={props.onAddRow}
          icon={<Plus className="size-3.5" />}
          label={t("navigation:tables.newRow")}
        />
      )}
    </>
  );
}

export function FieldSelect({
  fields,
  value,
  placeholder,
  onChange,
  className = "w-40 min-w-0",
}: {
  className?: string;
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
      <SelectTrigger size="sm" className={className}>
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
