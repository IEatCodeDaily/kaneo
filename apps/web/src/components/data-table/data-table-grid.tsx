import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  EyeOff,
  Info,
  ListFilter,
  LockKeyhole,
  Maximize2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import Layout from "@/components/common/layout";
import { CsvImportDialog } from "@/components/data-table/csv-import-dialog";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import {
  DataTableCellContent,
  INPUT_EDIT_TYPES,
} from "@/components/data-table/data-table-editors";
import {
  type ColumnSort,
  currencyUnit,
  DENSITY_ROW_HEIGHT,
  DENSITY_WRAP_LINES,
  type Density,
  defaultSummaryFn,
  EDITABLE_FIELD_TYPES,
  FIELD_TYPE_LABEL_KEYS,
  fieldIsRequired,
  fieldWidth,
  groupRows,
  groupValue,
  isQueryable,
  normalizeSorts,
  ROW_NUMBER_COLUMN_WIDTH,
  readDensity,
  readFrozenColumns,
  readHiddenFields,
  readShowSystemFields,
  type SummaryFn,
  sortedFields,
  summarize,
  supportsSummary,
  systemFields,
} from "@/components/data-table/data-table-format";
import {
  DataTableToolbar,
  FieldSelect,
} from "@/components/data-table/data-table-toolbar";
import FieldOptionsDialog from "@/components/data-table/field-options-dialog";
import { LinkNavigationProvider } from "@/components/data-table/link-cell";
import { NewRowDialog } from "@/components/data-table/new-row-dialog";
import { RowSheet } from "@/components/data-table/row-sheet";
import { TableActivityList } from "@/components/data-table/table-activity";
import { TicketLookupContext } from "@/components/data-table/ticket-cell";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteDataTableRow,
  exportTableRows,
  queryTableRows,
} from "@/fetchers/data-table/data-table";
import {
  dataTableKeys,
  useDataTableMutations,
} from "@/hooks/data-table/use-data-tables";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type {
  DataTable,
  DataTableField,
  DataTableFieldType,
  DataTableRow,
  FilterGroup,
  SelectChoice,
  TableRowQuery,
  TicketRef,
} from "@/types/data-table";
import { isFilterGroup } from "../../../../api/src/data-table/filter-expression";
import { ColumnResizeHandle } from "./column-resize";
import { FieldTypeConfirmation } from "./field-type-confirmation";
import {
  conditionActive,
  emptyFilterGroup,
  filterConditions,
  newFilterCondition,
  pruneFilterGroup,
} from "./filter-builder";
import type { SavedViewConfig } from "./saved-view-layout";

type Props = {
  initialConfig?: SavedViewConfig;
  onConfigChange?: (config: SavedViewConfig) => void;
  view?: "grid" | "history";
  table: DataTable;
  organizationId: string;
  organizationSlug: string;
  canEdit: boolean;
  onRename: () => void;
  onDelete: () => void;
};

// Cells whose editor is a popover picker: they open from the active cell.
const PICKER_TYPES: DataTableFieldType[] = [
  "select",
  "multiselect",
  "user",
  "ticket",
  "link",
];

// Quantities right-align (header and cell) so digits line up; dates don't.
const NUMERIC_CELL_TYPES: DataTableFieldType[] = [
  "number",
  "percent",
  "currency",
];

function FieldHeader({
  field,
  stickyLeft,
  frozen,
  freezeEdge,
  sort,
  sortOrder,
  onSort,
  canEdit,
  canHide,
  organizationId,
  tableId,
  onEditOptions,
  onFilter,
  onHide,
  onDeleted,
  width,
  onResize,
  onResetWidth,
  onToggleFreeze,
}: {
  field: DataTableField;
  stickyLeft: number | null;
  /** Columns 0..N freeze together; `frozen` = this column is in the range. */
  frozen: boolean;
  /** True for the last frozen column: carries the freeze-edge divider. */
  freezeEdge: boolean;
  sort: ColumnSort | null;
  /** 1-based position in the sort list, shown when more than one rule is active. */
  sortOrder: number | null;
  onSort: (sort: ColumnSort) => void;
  canEdit: boolean;
  canHide: boolean;
  organizationId: string;
  tableId: string;
  onEditOptions: (
    field: DataTableField,
    presetType: DataTableFieldType | null,
  ) => void;
  onFilter: (field: DataTableField) => void;
  onHide: (field: DataTableField) => void;
  onDeleted: (field: DataTableField) => void;
  width: number;
  onResize: (width: number) => void;
  onResetWidth: () => void;
  onToggleFreeze: () => void;
}) {
  const { t } = useTranslation();
  const { updateField } = useDataTableMutations(organizationId, tableId);
  const sorted = sort?.fieldId === field.id;
  const unit = currencyUnit(field);
  const numeric = NUMERIC_CELL_TYPES.includes(field.type);
  const freezeLabel = t(
    frozen
      ? "navigation:tables.unfreezeColumn"
      : "navigation:tables.freezeColumn",
  );

  const [pendingType, setPendingType] = useState<DataTableFieldType | null>(
    null,
  );
  const changeType = async (next: DataTableFieldType) => {
    if (!canEdit || field.system || next === field.type) return false;
    const needsEditor =
      ((next === "select" || next === "multiselect") &&
        !field.options?.choices?.length) ||
      (next === "currency" && !field.options?.code);
    if (needsEditor) {
      onEditOptions(field, next);
      return true;
    }
    try {
      await updateField.mutateAsync({
        organizationId,
        tableId,
        fieldId: field.id,
        type: next,
      });
      return true;
    } catch {
      toast.error(t("navigation:tables.renameFieldError"));
      return false;
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="columnheader"
          aria-sort={
            sorted
              ? sort.dir === "asc"
                ? "ascending"
                : "descending"
              : undefined
          }
          className={cn(
            "flex min-w-0 border-b",
            freezeEdge ? "border-r-2" : "border-r",
            stickyLeft !== null ? "sticky z-10" : "relative",
            frozen ? "bg-row-hover" : "bg-background",
          )}
          style={stickyLeft !== null ? { left: stickyLeft } : undefined}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("navigation:tables.fieldMenu", {
                    name: field.name,
                  })}
                  className="group/head relative flex h-8 min-w-0 flex-1 items-center gap-1.5 pl-2 pr-3 text-left text-xs text-muted-foreground outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-secondary data-popup-open:text-foreground"
                />
              }
            >
              {/* Quantities right-align: icon + name + unit sit together over the digits. */}
              {numeric && <span className="flex-1" />}
              {field.system ? (
                <LockKeyhole className="size-3.5 shrink-0" />
              ) : (
                <FieldTypeIcon type={field.type} />
              )}
              <span className="min-w-0 truncate font-medium">{field.name}</span>
              {unit && <span className="shrink-0">{unit}</span>}
              {!numeric && <span className="flex-1" />}
              {frozen && (
                <Pin
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              {sorted &&
                (sort.dir === "asc" ? (
                  <ArrowUp className="size-3.5 shrink-0" />
                ) : (
                  <ArrowDown className="size-3.5 shrink-0" />
                ))}
              {sorted && sortOrder !== null && (
                <span
                  aria-hidden
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {sortOrder}
                </span>
              )}
              {/* Hover swaps meta, never data: the chevron overlays the unit/sort end, so
                  the name and digits never shift. */}
              <span className="absolute inset-y-0 right-0 hidden items-center bg-row-hover px-1.5 group-hover/head:flex group-data-popup-open/head:flex group-data-popup-open/head:bg-secondary">
                <ChevronDown className="size-3.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {canEdit && !field.system && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => onEditOptions(field, null)}
                    >
                      <Pencil className="size-3.5" />
                      {t("navigation:tables.editField")}
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={field.type === "link"}>
                        <FieldTypeIcon type={field.type} />
                        {t("navigation:tables.changeType")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {EDITABLE_FIELD_TYPES.filter(
                          (type) => type !== field.type,
                        ).map((type) => (
                          <DropdownMenuItem
                            key={type}
                            onClick={() => setPendingType(type)}
                          >
                            <FieldTypeIcon type={type} />
                            {t(FIELD_TYPE_LABEL_KEYS[type])}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                {" "}
                <DropdownMenuItem
                  disabled={!isQueryable(field)}
                  onClick={() => onSort({ fieldId: field.id, dir: "asc" })}
                >
                  <ArrowUp className="size-3.5" />
                  {t("navigation:tables.sortAscending")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isQueryable(field)}
                  onClick={() => onSort({ fieldId: field.id, dir: "desc" })}
                >
                  <ArrowDown className="size-3.5" />
                  {t("navigation:tables.sortDescending")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={field.options?.unavailable}
                  onClick={() => onFilter(field)}
                >
                  <ListFilter className="size-3.5" />
                  {t("navigation:tables.filterByField")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleFreeze}>
                  {frozen ? (
                    <PinOff className="size-3.5" />
                  ) : (
                    <Pin className="size-3.5" />
                  )}
                  {freezeLabel}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {(canHide || (canEdit && !field.system)) && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuGroup>
                {canHide && (
                  <DropdownMenuItem onClick={() => onHide(field)}>
                    <EyeOff className="size-3.5" />
                    {t("navigation:tables.hideField")}
                  </DropdownMenuItem>
                )}
                {canEdit && !field.system && (
                  <DropdownMenuItem
                    className="text-destructive-foreground data-highlighted:text-destructive-foreground"
                    onClick={() => onDeleted(field)}
                  >
                    <Trash2 className="size-3.5" />
                    {t("navigation:tables.deleteField")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {field.options?.description && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={field.options.description}
                    className="shrink-0 text-muted-foreground"
                  />
                }
              >
                <Info className="size-3" />
              </TooltipTrigger>
              <TooltipContent>{field.options.description}</TooltipContent>
            </Tooltip>
          )}
          <ColumnResizeHandle
            name={field.name}
            width={width}
            onResize={onResize}
            onReset={onResetWidth}
          />
          {pendingType && (
            <FieldTypeConfirmation
              key={`${field.id}:${pendingType}`}
              field={field}
              nextType={pendingType}
              open
              onOpenChange={(open) => {
                if (!open) setPendingType(null);
              }}
              onConfirm={() => changeType(pendingType)}
            />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={onToggleFreeze}>
            {frozen ? (
              <PinOff className="size-3.5" />
            ) : (
              <Pin className="size-3.5" />
            )}
            {freezeLabel}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const GROUP_HEADER_HEIGHT = 36;

const SUMMARY_FNS = [
  "none",
  "sum",
  "avg",
  "min",
  "max",
  "filled",
  "empty",
  "checked",
] as const;

/** Minimal per-type value editor for bulk set (S3 bulk bar). */
function BulkSetField({
  fields,
  members,
  disabled,
  onApply,
}: {
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  disabled: boolean;
  onApply: (field: DataTableField, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const editable = fields.filter(
    (field) =>
      !field.system &&
      !["longtext", "link", "json", "ticket"].includes(field.type),
  );
  const [fieldId, setFieldId] = useState<string | null>(
    editable[0]?.id ?? null,
  );
  const [value, setValue] = useState<string>("");
  const field = editable.find((f) => f.id === fieldId);

  const apply = () => {
    if (!field) return;
    let parsed: unknown = value;
    if (field.type === "checkbox") {
      // Only an explicit true/false applies; anything else is ignored.
      if (value !== "true" && value !== "false") return;
      parsed = value === "true";
    } else if (["number", "percent", "currency"].includes(field.type)) {
      const n = Number(value);
      if (Number.isNaN(n)) return;
      parsed = n;
    } else if (value === "") parsed = null;
    onApply(field, parsed);
    setValue("");
  };

  if (!field) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="hidden text-muted-foreground sm:contents">
        {t("navigation:tables.setField")}
      </span>
      <FieldSelect
        fields={editable}
        value={field.id}
        placeholder=""
        onChange={(id) => {
          setFieldId(id);
          setValue("");
        }}
      />
      {field.type === "select" ? (
        <Select
          items={(field.options?.choices ?? []).map((choice) => ({
            value: choice.id,
            label: choice.label,
          }))}
          value={value || null}
          onValueChange={(v) => setValue(String(v ?? ""))}
        >
          <SelectTrigger size="sm" className="w-40 min-w-0">
            <SelectValue placeholder={t("navigation:tables.selectChoice")} />
          </SelectTrigger>
          <SelectContent>
            {(field.options?.choices ?? []).map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "user" ? (
        <Select
          items={Array.from(members.entries()).map(([id, member]) => ({
            value: id,
            label:
              member.user.name ||
              member.user.email ||
              t("navigation:tables.unknownValue"),
          }))}
          value={value || null}
          onValueChange={(v) => setValue(String(v ?? ""))}
        >
          <SelectTrigger size="sm" className="w-40 min-w-0">
            <SelectValue placeholder={t("navigation:tables.selectChoice")} />
          </SelectTrigger>
          <SelectContent>
            {Array.from(members.entries()).map(([id, m]) => (
              <SelectItem key={id} value={id}>
                {m.user.name ||
                  m.user.email ||
                  t("navigation:tables.unknownValue")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          size="sm"
          className="w-36 min-w-0"
          value={value}
          type={
            field.type === "checkbox"
              ? "text"
              : ["number", "percent", "currency"].includes(field.type)
                ? "number"
                : field.type === "date" || field.type === "datetime"
                  ? "date"
                  : "text"
          }
          placeholder={field.type === "checkbox" ? "true / false" : undefined}
          aria-label={t("navigation:tables.bulkValue", { field: field.name })}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={
          disabled ||
          (field.type === "checkbox"
            ? value !== "true" && value !== "false"
            : value === "")
        }
        onClick={apply}
      >
        {t("navigation:tables.apply")}
      </Button>
    </span>
  );
}

export function DataTableGrid({
  initialConfig,
  onConfigChange,
  view = "grid",
  table,
  organizationId,
  organizationSlug,
  canEdit,
  onRename,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    createRow,
    deleteRow: deleteRowMutation,
    deleteField: deleteFieldMutation,
    upsertCell,
  } = useDataTableMutations(organizationId, table.id);
  const { data: membersData = [] } =
    useGetActiveOrganizationMembers(organizationId);
  // better-auth's listMembers types as {members, total} | []; normalize once.
  const memberRows = Array.isArray(membersData)
    ? membersData
    : (membersData?.members ?? []);
  const members = useMemo(
    () =>
      new Map<string, MemberOption>(
        memberRows.map((m) => [m.userId || m.id, m]),
      ),
    [memberRows],
  );

  const [showSystem, setShowSystem] = useState(
    () => initialConfig?.showSystemFields ?? readShowSystemFields(table.id),
  );
  const [fieldOrder, setFieldOrder] = useState<string[]>(
    initialConfig?.fieldOrder ?? [],
  );
  const allFields = useMemo(() => {
    const fields = [
      ...sortedFields(table.fields),
      ...(showSystem ? systemFields(table.id, t) : []),
    ];
    return fields.sort((a, b) => {
      const x = fieldOrder.indexOf(a.id);
      const y = fieldOrder.indexOf(b.id);
      return (x < 0 ? fields.length : x) - (y < 0 ? fields.length : y);
    });
  }, [table.fields, table.id, showSystem, t, fieldOrder]);
  const choicesById = useMemo(() => {
    const map = new Map<string, SelectChoice>();
    for (const field of allFields) {
      for (const choice of field.options?.choices ?? []) {
        map.set(choice.id, choice);
      }
    }
    return map;
  }, [allFields]);
  const fieldsById = useMemo(
    () => new Map(allFields.map((field) => [field.id, field])),
    [allFields],
  );

  const [search, setSearch] = useState("");
  // Views saved before nested filters stored a flat list; those start empty.
  const [filters, setFilters] = useState<FilterGroup>(() => {
    const saved = initialConfig?.filters;
    return isFilterGroup(saved) ? saved : emptyFilterGroup();
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<ColumnSort[]>(() =>
    normalizeSorts(initialConfig?.sort),
  );
  const [groupFieldId, setGroupFieldId] = useState<string | null>(
    initialConfig?.groupFieldId ?? null,
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [summaryFns, setSummaryFns] = useState<Record<string, SummaryFn>>(
    initialConfig?.summaries ?? {},
  );
  const [density, setDensity] = useState<Density>(
    () => initialConfig?.rowHeight ?? readDensity(table.id),
  );
  const [widths, setWidths] = useState<Record<string, number>>(
    initialConfig?.columnWidths ?? {},
  );
  const setWidth = (id: string, width: number | null) =>
    setWidths((current) => {
      const next = { ...current };
      if (width === null) delete next[id];
      else next[id] = Math.round(Math.max(80, Math.min(800, width)));
      return next;
    });
  const columnWidth = (field: DataTableField) =>
    widths[field.id] ?? fieldWidth(field.type);
  const [hidden, setHidden] = useState<string[]>(
    () => initialConfig?.hiddenFields ?? readHiddenFields(table.id),
  );
  const changeHidden = (ids: string[]) => {
    setHidden(ids);
  };
  // Frozen data columns (spreadsheet-style: 0..N freeze together) persist per
  // table like hidden fields; the row-number gutter stays sticky regardless.
  const [frozenCount, setFrozenCount] = useState(
    () => initialConfig?.frozenColumns ?? readFrozenColumns(table.id),
  );
  const changeFrozen = (count: number) => {
    setFrozenCount(count);
  };
  const config = useMemo<SavedViewConfig>(
    () => ({
      filters,
      sort,
      groupFieldId,
      hiddenFields: hidden,
      fieldOrder,
      columnWidths: widths,
      rowHeight: density,
      frozenColumns: frozenCount,
      summaries: summaryFns,
      showSystemFields: showSystem,
    }),
    [
      filters,
      sort,
      groupFieldId,
      hidden,
      fieldOrder,
      widths,
      density,
      frozenCount,
      summaryFns,
      showSystem,
    ],
  );
  const lastConfig = useRef(JSON.stringify(config));
  useEffect(() => {
    const serialized = JSON.stringify(config);
    if (serialized !== lastConfig.current) {
      lastConfig.current = serialized;
      onConfigChange?.(config);
    }
  }, [config, onConfigChange]);
  // The first field names the row and is never hidden (Fields popover locks it).
  const fields = useMemo(
    () => allFields.filter((f, i) => i === 0 || !hidden.includes(f.id)),
    [allFields, hidden],
  );
  const [editing, setEditing] = useState<{
    rowId: string;
    fieldId: string;
    /** Type-to-replace: the printable character that opened the editor. */
    seed?: string;
  } | null>(null);
  // Row sheet opens only through the gutter or Space; prev/next walk the view.
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  // Active cell (NocoDB): a click selects the cell, a second click or Enter
  // edits it, arrows move it. Keyed by ids so it survives sort/filter.
  const [active, setActive] = useState<{
    rowId: string;
    fieldId: string;
  } | null>(null);
  const [dialogField, setDialogField] = useState<DataTableField | null>(null);
  const [dialogType, setDialogType] = useState<DataTableFieldType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<DataTableField | null>(
    null,
  );
  const activeFilters = useMemo(
    () => pruneFilterGroup(filters, conditionActive),
    [filters],
  );
  const rowQuery = useMemo<TableRowQuery>(
    () => ({
      search,
      includeSystem: showSystem,
      filters: activeFilters,
      sort: sort.length > 0 ? sort : null,
      groupFieldId,
      summaries: summaryFns,
    }),
    [search, showSystem, activeFilters, sort, groupFieldId, summaryFns],
  );
  const rowPages = useInfiniteQuery({
    queryKey: [
      ...dataTableKeys.detail(organizationId, table.id),
      "rows",
      rowQuery,
    ],
    queryFn: ({ pageParam, signal }) =>
      queryTableRows(
        { organizationId, tableId: table.id },
        { ...rowQuery, offset: pageParam },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    retry: false,
  });
  const result = rowPages.data?.pages[0];
  const allRows = useMemo(() => {
    const unique = new Map(
      rowPages.data?.pages.flatMap((p) => p.rows).map((r) => [r.id, r]) ?? [],
    );
    return [...unique.values()];
  }, [rowPages.data]);
  const visibleRows = allRows;
  const ticketLookup = useMemo(
    () => ({
      organizationId,
      organizationSlug,
      tableId: table.id,
      tickets: {
        ...table.tickets,
        ...(rowPages.data?.pages.reduce<Record<string, TicketRef>>(
          (refs, page) => ({ ...refs, ...page.tickets }),
          {},
        ) ?? {}),
      },
    }),
    [organizationId, organizationSlug, table.id, table.tickets, rowPages.data],
  );
  const serverSummary = (
    field: DataTableField,
    values: Record<string, string | number | null> | undefined,
    count: number,
  ) => {
    const fn = summaryFns[field.id] ?? "none";
    const value = values?.[field.id];
    if (fn === "none" || value == null || count === 0) return null;
    return ["filled", "empty", "checked"].includes(fn)
      ? `${value}/${count}`
      : Number(value).toLocaleString(undefined, {
          maximumFractionDigits: field.options?.precision ?? 2,
        });
  };

  // Selection never outlives the view: rows filtered/searched/sorted out (or
  // removed) are dropped, so bulk actions can't touch invisible rows.
  useEffect(() => {
    setSelected((current) => {
      if (current.size === 0) return current;
      const next = new Set(
        [...current].filter((id) => visibleRows.some((row) => row.id === id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [visibleRows]);

  // Summaries are selection-scoped: with rows picked, they describe the
  // selection, not the whole view.
  const scopeRows = useMemo(
    () =>
      selected.size > 0
        ? visibleRows.filter((row) => selected.has(row.id))
        : visibleRows,
    [visibleRows, selected],
  );

  const rowHeight = DENSITY_ROW_HEIGHT[density];
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const groupField =
    groupFieldId != null ? fieldsById.get(groupFieldId) : undefined;

  // Bucket keys are raw ids (choice ids, member ids); headers show resolved
  // labels and groups sort by them.

  const groupLabel = useCallback(
    (field: DataTableField, key: string): string => {
      if (key === "") return t("navigation:tables.unassigned");
      if (field.type === "checkbox")
        return key === "true"
          ? t("navigation:dashboards.yes")
          : t("navigation:dashboards.no");
      if (field.type === "select") return choicesById.get(key)?.label ?? key;
      if (field.type === "user") {
        const member = members.get(key);
        return (
          member?.user.name ||
          member?.user.email ||
          t("navigation:tables.formerMember")
        );
      }
      return key;
    },
    [t, choicesById, members],
  );

  // Flat render list: group headers (collapsible) + their rows, or plain rows.
  type GridItem =
    | { kind: "group"; key: string; rows: DataTableRow[] }
    | { kind: "row"; row: DataTableRow };
  const gridItems = useMemo<GridItem[]>(() => {
    if (!groupField) {
      return visibleRows.map((row) => ({ kind: "row", row }) as GridItem);
    }
    const items: GridItem[] = [];
    const loadedGroups = new Map(
      groupRows(groupField, visibleRows).map((g) => [g.key, g.rows]),
    );
    for (const bucket of result?.groups ?? []) {
      const group = {
        key: bucket.key,
        rows: loadedGroups.get(bucket.key) ?? [],
      };
      const collapsed = collapsedGroups.has(group.key);
      items.push({ kind: "group", key: group.key, rows: group.rows });
      if (!collapsed) {
        for (const row of group.rows) {
          items.push({ kind: "row", row });
        }
      }
    }
    return items;
  }, [groupField, visibleRows, collapsedGroups, result?.groups]);

  const renderedRows = useMemo(
    () =>
      gridItems
        .filter(
          (item): item is Extract<GridItem, { kind: "row" }> =>
            item.kind === "row",
        )
        .map((item) => item.row),
    [gridItems],
  );

  const rowNumberById = useMemo(
    () => new Map(renderedRows.map((row, index) => [row.id, index + 1])),
    [renderedRows],
  );

  const virtualizer = useVirtualizer({
    count: gridItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      gridItems[index]?.kind === "group" ? GROUP_HEADER_HEIGHT : rowHeight,
    getItemKey: (index) => {
      const item = gridItems[index];
      return item
        ? item.kind === "row"
          ? item.row.id
          : `group:${item.key}`
        : index;
    },
    overscan: 8,
  });
  // Fixed row heights change with density; drop the size cache so the new
  // estimate is picked up without a remount.
  useEffect(() => {
    // rowHeight is intentional: the virtualizer instance is stable across
    // option updates, so measure() must be re-run when density changes.
    if (rowHeight) virtualizer.measure();
  }, [virtualizer, rowHeight]);

  // After an editor closes, keys go back to the grid (arrows keep working).
  const refocusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const pendingCells = useRef(new Set<string>());
  const commitCell = async (
    row: DataTableRow,
    field: DataTableField,
    value: unknown,
  ) => {
    const key = `${row.id}:${field.id}`;
    if (!canEdit || field.system || pendingCells.current.has(key)) return false;
    pendingCells.current.add(key);
    try {
      await upsertCell.mutateAsync({
        organizationId,
        tableId: table.id,
        rowId: row.id,
        fieldId: field.id,
        value,
      });
      setEditing((current) =>
        current?.rowId === row.id && current.fieldId === field.id
          ? null
          : current,
      );
      refocusGrid();
      return true;
    } catch {
      toast.error(t("navigation:tables.saveCellError"));
      return false;
    } finally {
      pendingCells.current.delete(key);
    }
  };

  const setActiveCell = (rowIndex: number, colIndex: number) => {
    const nextRow = renderedRows[rowIndex];
    const nextField = fields[colIndex];
    if (!nextRow || !nextField) return;
    setActive({ rowId: nextRow.id, fieldId: nextField.id });
    const index = gridItems.findIndex(
      (item) => item.kind === "row" && item.row.id === nextRow.id,
    );
    if (index >= 0) virtualizer.scrollToIndex(index);
  };

  const activeCell = () => {
    if (!active) return null;
    const r = renderedRows.findIndex((row) => row.id === active.rowId);
    const c = fields.findIndex((field) => field.id === active.fieldId);
    return r < 0 || c < 0 ? null : { r, c, row: renderedRows[r] };
  };

  const moveActive = (dRow: number, dCol: number) => {
    const cell = activeCell();
    if (!cell) return;
    setActiveCell(
      Math.min(Math.max(cell.r + dRow, 0), renderedRows.length - 1),
      Math.min(Math.max(cell.c + dCol, 0), fields.length - 1),
    );
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Editors and pickers own their keys.
    if (event.defaultPrevented || editing || !active) return;
    const target = event.target as HTMLElement;
    if (target !== gridRef.current) return;
    const cell = activeCell();
    if (!cell) return;
    const lastRow = renderedRows.length - 1;
    const lastCol = fields.length - 1;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        // Modifier+arrow pins the row/column to its boundary.
        moveActive(
          move[0] * (move[0] < 0 ? cell.r : lastRow - cell.r),
          move[1] * (move[1] < 0 ? cell.c : lastCol - cell.c),
        );
      } else {
        moveActive(move[0], move[1]);
      }
      return;
    }
    if (event.key === "Tab") {
      // Wrap to the neighbouring row; at the grid's outer boundary Tab leaves.
      const atEdge = event.shiftKey
        ? cell.r === 0 && cell.c === 0
        : cell.r === lastRow && cell.c === lastCol;
      if (atEdge) return;
      event.preventDefault();
      const wrap = event.shiftKey ? cell.c === 0 : cell.c === lastCol;
      setActiveCell(
        wrap ? cell.r + (event.shiftKey ? -1 : 1) : cell.r,
        wrap
          ? event.shiftKey
            ? lastCol
            : 0
          : cell.c + (event.shiftKey ? -1 : 1),
      );
      return;
    }
    if (event.key === "Escape") {
      setActive(null);
      return;
    }
    // Space expands the row; Enter edits every column identically.
    if (event.key === " ") {
      event.preventDefault();
      setSheetRowId(active.rowId);
      return;
    }
    const field = fields.find((candidate) => candidate.id === active.fieldId);
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      canEdit &&
      field &&
      !field.system &&
      // Required fields cannot be emptied; zero and false are values, so the
      // clear always writes (never a no-op on falsy values).
      !fieldIsRequired(field)
    ) {
      event.preventDefault();
      void commitCell(
        cell.row,
        field,
        field.type === "checkbox" ? false : null,
      );
      return;
    }
    // Typing a printable character replaces the cell's value.
    if (
      canEdit &&
      field &&
      !field.system &&
      INPUT_EDIT_TYPES.includes(field.type) &&
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setEditing({ ...active, seed: event.key });
      return;
    }
    if (event.key === "Enter" && canEdit) {
      event.preventDefault();
      if (field?.system) return;
      if (
        field &&
        (PICKER_TYPES.includes(field.type) || field.type === "checkbox")
      ) {
        gridRef.current
          ?.querySelector<HTMLElement>(
            '[role="gridcell"][aria-selected="true"] [data-link-picker-trigger], [role="gridcell"][aria-selected="true"] [role="button"], [role="gridcell"][aria-selected="true"] button:not([data-link-chip]), [role="gridcell"][aria-selected="true"] [role="checkbox"]',
          )
          ?.click();
        return;
      }
      setEditing(active);
    }
  };

  const [newRowValues, setNewRowValues] = useState<Record<
    string,
    unknown
  > | null>(null);
  const addRow = (presetValues: Record<string, unknown> = {}) => {
    if (canEdit) setNewRowValues(presetValues);
  };

  const addRowInGroup = async (field: DataTableField, key: string) => {
    const value = groupValue(field, key);
    await addRow(value === null ? undefined : { [field.id]: value });
  };

  const [csvSource, setCsvSource] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportCsv = async () => {
    try {
      const blob = await exportTableRows(
        { organizationId, tableId: table.id },
        rowQuery,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${table.name}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("navigation:tables.exportError"));
    }
  };

  // Bulk mutations loop the single-row endpoints: fine at page sizes (<=1000).
  // ponytail: swap for a real bulk endpoint if tables outgrow that.
  const bulkBusy = upsertCell.isPending || deleteRowMutation.isPending;
  const bulkSetField = async (field: DataTableField, value: unknown) => {
    if (!canEdit) return;
    let done = 0;
    try {
      for (const rowId of selected) {
        await upsertCell.mutateAsync({
          organizationId,
          tableId: table.id,
          rowId,
          fieldId: field.id,
          value,
        });
        done += 1;
      }
      setSelected(new Set());
      toast.success(t("navigation:tables.bulkApplied", { count: done }));
    } catch {
      toast.error(
        t("navigation:tables.bulkError", { done, count: selected.size }),
      );
    }
  };

  const bulkDeleteRows = async (ids: string[]) => {
    if (!canEdit) return;
    const count = ids.length;
    let done = 0;
    try {
      for (const rowId of ids) {
        await deleteDataTableRow({ organizationId, tableId: table.id, rowId });
        done += 1;
      }
      // One refresh for the whole batch, not one per row.
      queryClient.invalidateQueries({
        queryKey: dataTableKeys.detail(organizationId, table.id),
      });
      setSelected(new Set());
      toast.success(t("navigation:tables.bulkDeleted", { count: done }));
    } catch {
      toast.error(t("navigation:tables.bulkError", { done, count }));
    }
  };

  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);

  const confirmDeleteField = async () => {
    if (!fieldToDelete) return;
    const field = fieldToDelete;
    setFieldToDelete(null);
    try {
      await deleteFieldMutation.mutateAsync({
        organizationId,
        tableId: table.id,
        fieldId: field.id,
      });
      setFilters((current) =>
        pruneFilterGroup(current, (f) => f.fieldId !== field.id),
      );
      setGroupFieldId((current) => (current === field.id ? null : current));
      setSort((current) => current.filter((rule) => rule.fieldId !== field.id));
      setHidden((current) => current.filter((id) => id !== field.id));
      setFieldOrder((current) => current.filter((id) => id !== field.id));
      setWidth(field.id, null);
      setCollapsedGroups(new Set());
      setSummaryFns((current) => {
        const { [field.id]: _dropped, ...rest } = current;
        return rest;
      });
    } catch {
      toast.error(t("navigation:tables.deleteFieldError"));
    }
  };

  const openDialog = (
    field: DataTableField | null,
    presetType: DataTableFieldType | null,
  ) => {
    setDialogField(field);
    setDialogType(presetType);
    setDialogOpen(true);
  };

  const filtersActive =
    search !== "" || filterConditions(activeFilters).length > 0;
  const allLoaded = !rowPages.hasNextPage;

  // Grid template: row # · fields · trailing "+" add-field cell (DS §2 Grid).
  const ADD_FIELD_WIDTH = 40;
  const trailing = canEdit ? ADD_FIELD_WIDTH : 0;
  // Sticky offsets for the frozen columns: gutter width plus the widths of
  // the frozen columns before each, so header and body cells agree exactly.
  const frozenLefts: number[] = [];
  let frozenX = ROW_NUMBER_COLUMN_WIDTH;
  for (let i = 0; i < frozenCount && i < fields.length; i++) {
    frozenLefts.push(frozenX);
    frozenX += columnWidth(fields[i]);
  }
  const gridTemplate = `${ROW_NUMBER_COLUMN_WIDTH}px ${fields
    .map((field) => `${columnWidth(field)}px`)
    .join(" ")}${canEdit ? ` ${ADD_FIELD_WIDTH}px` : ""}`;
  const totalWidth =
    ROW_NUMBER_COLUMN_WIDTH +
    fields.reduce((sum, field) => sum + columnWidth(field), 0) +
    trailing;

  if (view === "history")
    return (
      <TicketLookupContext.Provider value={ticketLookup}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl p-4">
            <TableActivityList
              table={table}
              fields={allFields}
              members={members}
              canEdit={canEdit}
            />
          </div>
        </div>
      </TicketLookupContext.Provider>
    );

  return (
    <LinkNavigationProvider organizationId={organizationId} members={members}>
      <TicketLookupContext.Provider value={ticketLookup}>
        <Layout.Toolbar>
          <DataTableToolbar
            fields={allFields}
            onFieldOrderChange={setFieldOrder}
            members={members}
            hidden={hidden}
            showSystemFields={showSystem}
            onShowSystemFieldsChange={(show) => {
              setShowSystem(show);

              if (!show) {
                setFilters((current) =>
                  pruneFilterGroup(
                    current,
                    (filter) => !filter.fieldId.startsWith("__"),
                  ),
                );
                setSort((current) =>
                  current.some((rule) => rule.fieldId.startsWith("__"))
                    ? current.filter((rule) => !rule.fieldId.startsWith("__"))
                    : current,
                );
                setGroupFieldId((current) =>
                  current?.startsWith("__") ? null : current,
                );
              }
            }}
            onHiddenChange={changeHidden}
            filterOpen={filterOpen}
            onFilterOpenChange={setFilterOpen}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            search={search}
            onSearchChange={setSearch}
            density={density}
            onDensityChange={(next) => {
              setDensity(next);
            }}
            groupFieldId={groupFieldId}
            onGroupChange={(fieldId) => {
              setGroupFieldId(fieldId);
              setCollapsedGroups(new Set());
            }}
            summariesActive={Object.values(summaryFns).some(
              (fn) => fn !== "none",
            )}
            onSummariesToggle={() =>
              setSummaryFns((current) => {
                const on = Object.values(current).some((fn) => fn !== "none");
                if (on) return {};
                const next: Record<string, SummaryFn> = {};
                for (const field of fields) {
                  if (supportsSummary(field))
                    next[field.id] = defaultSummaryFn(field);
                }
                return next;
              })
            }
            canEdit={canEdit}
            rowsInView={visibleRows.length}
            onAddRow={() => addRow()}
            onAddField={() => openDialog(null, null)}
            onImport={() => fileInputRef.current?.click()}
            onExport={exportCsv}
            onRename={onRename}
            onDelete={onDelete}
          />
        </Layout.Toolbar>
        {csvSource !== null && (
          <CsvImportDialog
            csv={csvSource}
            fields={table.fields}
            target={{ organizationId, tableId: table.id }}
            onClose={() => setCsvSource(null)}
            onImported={() =>
              queryClient.invalidateQueries({
                queryKey: dataTableKeys.detail(organizationId, table.id),
              })
            }
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void file
                .text()
                .then(setCsvSource)
                .catch(() =>
                  toast.error(t("navigation:tables.importError", { done: 0 })),
                );
          }}
        />

        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
          {rowPages.isError ? (
            <div role="alert" className="flex items-center gap-3 p-4 text-sm">
              <span>{t("navigation:tables.queryError")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => rowPages.refetch()}
              >
                {t("navigation:tables.queryRetry")}
              </Button>
            </div>
          ) : rowPages.isPending ||
            (rowPages.isFetching && !rowPages.isFetchingNextPage) ? (
            <div role="status" className="p-4 text-sm text-muted-foreground">
              {t("navigation:tables.queryLoading")}
            </div>
          ) : allFields.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Columns3 />
                </EmptyMedia>
                <EmptyTitle className="text-sm">
                  {t("navigation:tables.empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {canEdit
                    ? t("navigation:tables.noFields")
                    : t("navigation:tables.readOnlyEmpty")}
                </EmptyDescription>
              </EmptyHeader>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialog(null, null)}
                >
                  <Plus className="size-3.5" />{" "}
                  {t("navigation:tables.addField")}
                </Button>
              )}
            </Empty>
          ) : (
            <div
              className="flex min-h-full flex-col"
              style={{ minWidth: totalWidth }}
            >
              {/* The grid owns focus: arrows/Tab/Enter/Space drive the active cell. */}
              <div
                ref={gridRef}
                role="grid"
                tabIndex={0}
                aria-rowcount={visibleRows.length + 1}
                onKeyDown={onGridKeyDown}
                className="outline-none"
              >
                <div
                  role="row"
                  className="sticky top-0 z-30 grid bg-background"
                  style={{
                    gridTemplateColumns: gridTemplate,
                    width: totalWidth,
                  }}
                >
                  <div
                    role="columnheader"
                    aria-label={t("navigation:tables.rowNumber")}
                    className="sticky left-0 z-10 flex items-center justify-end border-r border-b bg-background pr-1"
                  >
                    <Checkbox
                      checked={
                        renderedRows.length > 0 &&
                        renderedRows.every((row) => selected.has(row.id))
                      }
                      aria-label={t("navigation:tables.selectAllRows")}
                      className="size-3.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-checked:opacity-100"
                      onCheckedChange={(next) =>
                        setSelected(
                          next
                            ? new Set(renderedRows.map((row) => row.id))
                            : new Set(),
                        )
                      }
                    />
                  </div>
                  {fields.map((field, index) => (
                    <FieldHeader
                      key={field.id}
                      field={field}
                      stickyLeft={
                        index < frozenCount ? frozenLefts[index] : null
                      }
                      frozen={index < frozenCount}
                      freezeEdge={index === frozenCount - 1}
                      sort={
                        sort.find((rule) => rule.fieldId === field.id) ?? null
                      }
                      sortOrder={
                        sort.length > 1
                          ? sort.findIndex(
                              (rule) => rule.fieldId === field.id,
                            ) + 1 || null
                          : null
                      }
                      onSort={(rule) => setSort([rule])}
                      canEdit={canEdit}
                      canHide={index > 0 && !field.system}
                      organizationId={organizationId}
                      tableId={table.id}
                      onEditOptions={(target, presetType) =>
                        openDialog(target, presetType)
                      }
                      onFilter={(target) => {
                        setFilters((current) =>
                          filterConditions(current).length >= 50
                            ? current
                            : {
                                ...current,
                                children: [
                                  ...current.children,
                                  newFilterCondition(target),
                                ],
                              },
                        );
                        setFilterOpen(true);
                      }}
                      onHide={(target) => changeHidden([...hidden, target.id])}
                      onDeleted={setFieldToDelete}
                      width={columnWidth(field)}
                      onResize={(width) => setWidth(field.id, width)}
                      onResetWidth={() => setWidth(field.id, null)}
                      // Freeze to this column, or unfreeze back to its start.
                      onToggleFreeze={() =>
                        changeFrozen(index < frozenCount ? index : index + 1)
                      }
                    />
                  ))}
                  {canEdit && (
                    <div role="columnheader" className="border-b bg-background">
                      <button
                        type="button"
                        aria-label={t("navigation:tables.addField")}
                        title={t("navigation:tables.addField")}
                        className="flex size-full items-center justify-center text-muted-foreground outline-none hover:bg-row-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => openDialog(null, null)}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {visibleRows.length === 0 ? (
                  <Empty className="flex-none py-12">
                    <EmptyHeader>
                      <EmptyTitle className="text-sm">
                        {filtersActive
                          ? t("navigation:tables.noMatches")
                          : t("navigation:tables.noRowsTitle")}
                      </EmptyTitle>
                      <EmptyDescription>
                        {filtersActive
                          ? t("navigation:tables.noMatchesHint")
                          : t("navigation:tables.noRows")}
                      </EmptyDescription>
                    </EmptyHeader>
                    {filtersActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearch("");
                          setFilters(emptyFilterGroup());
                        }}
                      >
                        {t("common:actions.clearAllFilters")}
                      </Button>
                    ) : (
                      canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addRow()}
                        >
                          <Plus className="size-3.5" />
                          {t("navigation:tables.newRow")}
                        </Button>
                      )
                    )}
                  </Empty>
                ) : (
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((item) => {
                      const entry = gridItems[item.index];
                      if (!entry) return null;
                      if (entry.kind === "group") {
                        const gf = groupField;
                        if (!gf) return null;
                        const collapsed = collapsedGroups.has(entry.key);
                        const label = groupLabel(gf, entry.key);
                        return (
                          <div
                            key={`group:${entry.key}`}
                            role="row"
                            className="group absolute left-0 grid bg-background"
                            style={{
                              height: GROUP_HEADER_HEIGHT,
                              top: item.start,
                              gridTemplateColumns: gridTemplate,
                              width: totalWidth,
                            }}
                          >
                            <div
                              role="rowheader"
                              className="flex items-center gap-2 border-b border-r bg-secondary/50 ps-2 pe-2 text-xs"
                              style={{ gridColumn: "1 / -1" }}
                            >
                              <button
                                type="button"
                                aria-expanded={!collapsed}
                                aria-label={t("navigation:tables.toggleGroup", {
                                  group: label,
                                })}
                                className="flex min-w-0 items-center gap-1.5 rounded-md py-1 text-left font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() =>
                                  setCollapsedGroups((current) => {
                                    const next = new Set(current);
                                    if (next.has(entry.key)) {
                                      next.delete(entry.key);
                                    } else {
                                      next.add(entry.key);
                                    }
                                    return next;
                                  })
                                }
                              >
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 shrink-0 transition-transform",
                                    collapsed && "-rotate-90",
                                  )}
                                />
                                <span className="truncate">{label}</span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {result?.groups.find(
                                    (g) => g.key === entry.key,
                                  )?.total ?? 0}
                                </span>
                              </button>
                              {/* Per-group aggregates for columns with a
                                summary function (design: count + same
                                aggregates). */}
                              {fields
                                .filter(
                                  (field) =>
                                    (summaryFns[field.id] ?? "none") !== "none",
                                )
                                .map((field) => (
                                  <span
                                    key={field.id}
                                    className="hidden shrink-0 tabular-nums text-muted-foreground lg:inline"
                                  >
                                    {field.name}{" "}
                                    {serverSummary(
                                      field,
                                      result?.groups.find(
                                        (g) => g.key === entry.key,
                                      ),
                                      result?.groups.find(
                                        (g) => g.key === entry.key,
                                      )?.total ?? 0,
                                    ) ?? "—"}
                                  </span>
                                ))}
                              <span className="flex-1" />
                              {canEdit && (
                                <button
                                  type="button"
                                  className="hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring group-hover:flex"
                                  onClick={() => addRowInGroup(gf, entry.key)}
                                >
                                  <Plus className="size-3.5" />
                                  {t("navigation:tables.newRowIn", {
                                    group: label,
                                  })}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      const row = entry.row;
                      const rowIndex = item.index;
                      // Position among rows (group headers excluded), 1-based.
                      const rowNumber =
                        rowNumberById.get(row.id) ?? rowIndex + 1;
                      const isSelected = selected.has(row.id);
                      const isActiveRow = active?.rowId === row.id;
                      return (
                        <div
                          key={row.id}
                          role="row"
                          aria-rowindex={rowIndex + 2}
                          aria-selected={isSelected || undefined}
                          data-active={isActiveRow || undefined}
                          className={cn(
                            "group absolute left-0 grid bg-background hover:bg-row-hover",
                            isSelected &&
                              "bg-row-selected hover:bg-row-selected",
                          )}
                          style={{
                            height: rowHeight,
                            // top, not transform: transform would trap the sticky
                            // cells inside the row box and break horizontal stick.
                            top: item.start,
                            gridTemplateColumns: gridTemplate,
                            width: totalWidth,
                          }}
                        >
                          <div
                            role="rowheader"
                            className={cn(
                              "sticky left-0 z-10 flex items-center justify-center gap-1 border-r border-b text-xs tabular-nums text-muted-foreground",
                              isSelected
                                ? "bg-row-selected group-hover:bg-row-selected"
                                : "bg-background group-hover:bg-row-hover",
                            )}
                          >
                            {/* NocoDB gutter: the row number at rest; hover
                              swaps in select + expand. */}
                            <span
                              aria-hidden
                              className={cn(
                                "pointer-events-none absolute inset-0 flex items-center justify-center group-focus-within:opacity-0 group-hover:opacity-0",
                                isSelected && "opacity-0",
                              )}
                            >
                              {rowNumber}
                            </span>
                            <Checkbox
                              checked={isSelected}
                              aria-label={t("navigation:tables.selectRow", {
                                row: rowNumber,
                              })}
                              className={cn(
                                "size-3.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                                isSelected && "opacity-100",
                              )}
                              onCheckedChange={(next) =>
                                setSelected((current) => {
                                  const next2 = new Set(current);
                                  if (next) next2.add(row.id);
                                  else next2.delete(row.id);
                                  return next2;
                                })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={t("navigation:tables.expandRow", {
                                row: rowNumber,
                              })}
                              className="size-5! opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                              onClick={() => setSheetRowId(row.id)}
                            >
                              <Maximize2 className="size-3" />
                            </Button>
                          </div>
                          {fields.map((field, fieldIndex) => (
                            // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled once, by the grid (onGridKeyDown)
                            <div
                              key={field.id}
                              role="gridcell"
                              aria-readonly={field.system || undefined}
                              aria-selected={
                                (isActiveRow && active?.fieldId === field.id) ||
                                undefined
                              }
                              aria-label={t("navigation:tables.cellAria", {
                                field: field.name,
                                row: rowNumber,
                              })}
                              onClick={(event) => {
                                if (
                                  (event.target as HTMLElement).closest(
                                    "input, textarea, a",
                                  )
                                )
                                  return;
                                const isActiveCell =
                                  active?.rowId === row.id &&
                                  active.fieldId === field.id;
                                setActive({ rowId: row.id, fieldId: field.id });
                                refocusGrid();
                                if (!canEdit || field.system || !isActiveCell)
                                  return;
                                if (
                                  PICKER_TYPES.includes(field.type) ||
                                  field.type === "checkbox"
                                ) {
                                  // Whitespace on an active picker cell opens the same control.
                                  if (
                                    !(event.target as HTMLElement).closest(
                                      "button, [role='button'], [role='checkbox']",
                                    )
                                  ) {
                                    event.currentTarget
                                      .querySelector<HTMLElement>(
                                        "button, [role='button'], [role='checkbox']",
                                      )
                                      ?.click();
                                  }
                                } else if (field.type !== "link")
                                  setEditing({
                                    rowId: row.id,
                                    fieldId: field.id,
                                  });
                              }}
                              className={cn(
                                "flex min-w-0 items-center gap-1.5 border-b px-2 text-ui",
                                fieldIndex === frozenCount - 1
                                  ? "border-r-2"
                                  : "border-r",
                                fieldIndex < frozenCount
                                  ? "sticky z-10"
                                  : "relative z-0",
                                editing?.rowId === row.id &&
                                  editing.fieldId === field.id &&
                                  (fieldIndex < frozenCount
                                    ? "z-20 bg-background"
                                    : "z-[1] bg-background"),
                                isSelected
                                  ? "bg-row-selected group-hover:bg-row-selected"
                                  : isActiveRow
                                    ? "bg-row-hover"
                                    : "bg-background group-hover:bg-row-hover",
                                NUMERIC_CELL_TYPES.includes(field.type) &&
                                  "justify-end",
                                // Wrapped cells clip at the fixed row height —
                                // except while their editor is open.
                                DENSITY_WRAP_LINES[density] &&
                                  !(
                                    editing?.rowId === row.id &&
                                    editing.fieldId === field.id
                                  ) &&
                                  "overflow-hidden",
                                field.system && "text-muted-foreground",
                                // Active cell: an inset accent ring, drawn over
                                // the borders (NocoDB).
                                "aria-selected:shadow-[inset_0_0_0_2px_var(--primary)]",
                              )}
                              style={
                                fieldIndex < frozenCount
                                  ? { left: frozenLefts[fieldIndex] }
                                  : undefined
                              }
                            >
                              <DataTableCellContent
                                row={row}
                                field={field}
                                members={members}
                                wrapLines={DENSITY_WRAP_LINES[density]}
                                seed={
                                  editing?.rowId === row.id &&
                                  editing.fieldId === field.id
                                    ? editing.seed
                                    : undefined
                                }
                                // Pickers and checkboxes activate only after selection.
                                canEdit={
                                  canEdit &&
                                  (!(
                                    PICKER_TYPES.includes(field.type) ||
                                    field.type === "checkbox"
                                  ) ||
                                    (isActiveRow &&
                                      active?.fieldId === field.id))
                                }
                                isEditing={
                                  editing?.rowId === row.id &&
                                  editing?.fieldId === field.id
                                }
                                onEditStart={() => {
                                  // First click selects; a click on the
                                  // already-active cell (or a double-click) edits.
                                  const isActiveCell =
                                    active?.rowId === row.id &&
                                    active.fieldId === field.id;
                                  setActive({
                                    rowId: row.id,
                                    fieldId: field.id,
                                  });
                                  if (field.system || !isActiveCell) return;
                                  setEditing({
                                    rowId: row.id,
                                    fieldId: field.id,
                                  });
                                }}
                                onEditEnd={() => {
                                  setEditing(null);
                                  refocusGrid();
                                }}
                                onCommit={(value) =>
                                  commitCell(row, field, value)
                                }
                              />
                            </div>
                          ))}
                          {canEdit && <div className="border-b" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {canEdit && visibleRows.length > 0 && (
                <button
                  type="button"
                  className="flex h-8 shrink-0 items-center border-b text-ui text-muted-foreground outline-none hover:bg-row-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  style={{ width: totalWidth }}
                  onClick={() => addRow()}
                >
                  <span
                    className="sticky left-0 flex justify-center"
                    style={{ width: ROW_NUMBER_COLUMN_WIDTH }}
                  >
                    <Plus className="size-3.5" />
                  </span>
                  <span
                    className="sticky px-2"
                    style={{ left: ROW_NUMBER_COLUMN_WIDTH }}
                  >
                    {t("navigation:tables.newRow")}
                  </span>
                </button>
              )}
              <span className="flex-1" />

              {/* Per-field footer summaries (S3): sticky above the footer, off by
                default, selection-scoped. Each cell picks its function. */}
              {Object.values(summaryFns).some((fn) => fn !== "none") &&
                visibleRows.length > 0 && (
                  <div
                    className="sticky bottom-8 left-0 z-10 grid bg-background"
                    style={{
                      gridTemplateColumns: gridTemplate,
                      width: totalWidth,
                    }}
                  >
                    <div
                      className="sticky left-0 z-10 flex items-center justify-center border-r border-b bg-background text-xs text-muted-foreground"
                      title={t(
                        selected.size > 0
                          ? "navigation:tables.summarySelection"
                          : "navigation:tables.summaryView",
                      )}
                    >
                      {t(
                        selected.size > 0
                          ? "navigation:tables.summarySelectionShort"
                          : "navigation:tables.summaryViewShort",
                      )}
                    </div>
                    {fields.map((field) => {
                      const fn = summaryFns[field.id] ?? "none";
                      const text =
                        selected.size > 0
                          ? summarize(fn, field, scopeRows)
                          : serverSummary(
                              field,
                              result?.summaries,
                              result?.total ?? 0,
                            );
                      return (
                        <div
                          key={field.id}
                          className={cn(
                            "flex min-w-0 items-center border-r border-b bg-background px-2 text-xs text-muted-foreground",
                            NUMERIC_CELL_TYPES.includes(field.type) &&
                              "justify-end",
                          )}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  className="w-full truncate text-left tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={t(
                                    "navigation:tables.summaryMenu",
                                    {
                                      field: field.name,
                                    },
                                  )}
                                >
                                  {text ?? "—"}
                                </button>
                              }
                            />
                            <DropdownMenuContent
                              align="start"
                              className="min-w-40"
                            >
                              {SUMMARY_FNS.filter(
                                (option) =>
                                  option === "none" ||
                                  ["filled", "empty"].includes(option) ||
                                  (option === "checked"
                                    ? field.type === "checkbox"
                                    : NUMERIC_CELL_TYPES.includes(field.type)),
                              ).map((option) => (
                                <DropdownMenuCheckboxItem
                                  key={option}
                                  checked={fn === option}
                                  onCheckedChange={() =>
                                    setSummaryFns((current) => ({
                                      ...current,
                                      [field.id]: option,
                                    }))
                                  }
                                >
                                  {t(`navigation:tables.summary_${option}`)}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Footer: honest count (DS rule 4) — swaps to the bulk bar while
                rows are selected (S3). */}
              {selected.size > 0 ? (
                <div className="sticky bottom-0 left-0 z-20 flex h-8 shrink-0 items-center gap-2 border-t bg-background px-3 text-xs">
                  <span className="font-medium tabular-nums">
                    {t("navigation:tables.bulkSelected", {
                      count: selected.size,
                    })}
                  </span>
                  {canEdit && (
                    <BulkSetField
                      fields={fields}
                      members={members}
                      disabled={bulkBusy}
                      onApply={(field, value) => bulkSetField(field, value)}
                    />
                  )}
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!canEdit || bulkBusy}
                    className="text-destructive-foreground hover:text-destructive-foreground"
                    onClick={() => setBulkDeleteIds([...selected])}
                  >
                    <Trash2 className="size-3.5" />
                    {t("navigation:tables.bulkDelete")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={bulkBusy}
                    onClick={() => setSelected(new Set())}
                  >
                    {t("common:actions.clear")}
                  </Button>
                </div>
              ) : (
                <div
                  className="sticky bottom-0 left-0 flex h-8 shrink-0 items-center gap-3 border-t bg-background px-3 text-xs text-muted-foreground"
                  style={{ width: "min(100%, 100vw)" }}
                >
                  <span className="tabular-nums">
                    <Trans
                      i18nKey="navigation:tables.queryCount"
                      values={{
                        loaded: allRows.length,
                        matched: result?.total ?? 0,
                        total: result?.tableTotal ?? 0,
                      }}
                      components={{
                        b: <span className="font-medium text-foreground" />,
                      }}
                    />
                  </span>
                  {!allLoaded && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={rowPages.isFetchingNextPage}
                      onClick={() => rowPages.fetchNextPage()}
                    >
                      {t(
                        rowPages.isFetchingNextPage
                          ? "navigation:tables.queryLoading"
                          : "navigation:tables.loadMore",
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <AlertDialog
          open={bulkDeleteIds.length > 0}
          onOpenChange={(open) => !open && setBulkDeleteIds([])}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("navigation:tables.bulkDeleteTitle", {
                  count: bulkDeleteIds.length,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("navigation:tables.bulkDeleteConfirm", {
                  count: bulkDeleteIds.length,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" size="sm" render={<AlertDialogClose />}>
                {t("navigation:tables.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkBusy}
                onClick={async () => {
                  const ids = bulkDeleteIds;
                  setBulkDeleteIds([]);
                  await bulkDeleteRows(ids);
                }}
              >
                {t("navigation:tables.bulkDelete")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {newRowValues !== null && (
          <NewRowDialog
            tableName={table.name}
            fields={fields}
            members={members}
            initialValues={newRowValues}
            onOpenChange={(open) => !open && setNewRowValues(null)}
            onCreate={(values) =>
              createRow.mutateAsync({
                organizationId,
                tableId: table.id,
                values,
              })
            }
          />
        )}
        <RowSheet
          open={sheetRowId !== null}
          onOpenChange={(next) => !next && setSheetRowId(null)}
          table={table}
          row={allRows.find((row) => row.id === sheetRowId) ?? null}
          rowIndex={visibleRows.findIndex((row) => row.id === sheetRowId)}
          rowCount={visibleRows.length}
          fields={sortedFields(table.fields)}
          members={members}
          canEdit={canEdit}
          onCommit={(row, field, value) => commitCell(row, field, value)}
          onPrev={() =>
            setSheetRowId((current) => {
              const index = visibleRows.findIndex((row) => row.id === current);
              if (index <= 0) return current;
              return visibleRows[index - 1].id;
            })
          }
          onNext={() =>
            setSheetRowId((current) => {
              const index = visibleRows.findIndex((row) => row.id === current);
              if (index < 0 || index >= visibleRows.length - 1) return current;
              return visibleRows[index + 1].id;
            })
          }
          hasPrev={visibleRows.findIndex((row) => row.id === sheetRowId) > 0}
          hasNext={
            visibleRows.findIndex((row) => row.id === sheetRowId) >= 0 &&
            visibleRows.findIndex((row) => row.id === sheetRowId) <
              visibleRows.length - 1
          }
        />

        <FieldOptionsDialog
          organizationId={organizationId}
          tableId={table.id}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          field={dialogField}
          initialType={dialogType}
          members={members}
        />

        <AlertDialog
          open={fieldToDelete !== null}
          onOpenChange={(open) => !open && setFieldToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("navigation:tables.deleteField")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("navigation:tables.deleteFieldConfirm", {
                  name: fieldToDelete?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" size="sm" render={<AlertDialogClose />}>
                {t("navigation:tables.cancel")}
              </Button>
              <Button size="sm" onClick={confirmDeleteField}>
                {t("navigation:tables.deleteField")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TicketLookupContext.Provider>
    </LinkNavigationProvider>
  );
}
