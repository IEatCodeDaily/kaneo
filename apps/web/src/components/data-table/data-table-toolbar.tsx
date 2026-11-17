import {
  ArrowUpDown,
  Download,
  Eye,
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
  sort: ColumnSort | null;
  onSortChange: (sort: ColumnSort | null) => void;
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
  // The primary field is always visible, so it never counts as hidden.
  const hiddenCount = fields.filter(
    (f, i) => i > 0 && hidden.includes(f.id),
  ).length;
  // Draft rows without a value don't narrow anything, so they don't count.
  const activeCount = filterConditions(filters).filter(conditionActive).length;
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
        <PopoverContent align="start" className="w-70">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.fieldsShown", {
              shown:
                fields.filter((field) => !field.system).length - hiddenCount,
              total: fields.filter((field) => !field.system).length,
            })}
          </p>
          <div className="flex max-h-72 flex-col overflow-y-auto p-1">
            {fields
              .filter((field) => !field.system)
              .map((field, index) => {
                // The first field names the row; it can't be hidden.
                const locked = index === 0;
                const visible = locked || !hidden.includes(field.id);
                return (
                  <div
                    key={field.id}
                    className="flex h-7 items-center gap-2 rounded-md px-2 text-ui hover:bg-accent"
                  >
                    <FieldTypeIcon
                      type={field.type}
                      className="text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {field.name}
                    </span>
                    {props.onFieldOrderChange && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t(
                            "navigation:tables.savedViews.moveLeft",
                            { name: field.name },
                          )}
                          disabled={index === 0}
                          onClick={() => {
                            const ids = fields
                              .filter((f) => !f.system)
                              .map((f) => f.id);
                            [ids[index - 1], ids[index]] = [
                              ids[index],
                              ids[index - 1],
                            ];
                            props.onFieldOrderChange?.(ids);
                          }}
                        >
                          ←
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t(
                            "navigation:tables.savedViews.moveRight",
                            { name: field.name },
                          )}
                          disabled={
                            index === fields.filter((f) => !f.system).length - 1
                          }
                          onClick={() => {
                            const ids = fields
                              .filter((f) => !f.system)
                              .map((f) => f.id);
                            [ids[index], ids[index + 1]] = [
                              ids[index + 1],
                              ids[index],
                            ];
                            props.onFieldOrderChange?.(ids);
                          }}
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
                  </div>
                );
              })}
          </div>
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
            fields={fields.filter((field) => !field.options?.unavailable)}
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
              applied={sort !== null}
              badge={sort ? 1 : undefined}
            />
          }
        />
        <PopoverContent align="start" className="w-100">
          <p className="px-3 pt-2.5 pb-1 text-xs text-muted-foreground">
            {t("navigation:tables.sortBy")}
          </p>
          <div className="flex items-center gap-1 px-2 pb-2">
            <FieldSelect
              fields={queryableFields}
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
