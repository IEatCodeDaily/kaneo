import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  EyeOff,
  ListFilter,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Layout from "@/components/common/layout";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import { csvParse, csvSerialize } from "@/components/data-table/data-table-csv";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
import {
  type ColumnSort,
  currencyUnit,
  type DataTableFilter,
  DENSITY_ROW_HEIGHT,
  type Density,
  defaultFilterFor,
  EDITABLE_FIELD_TYPES,
  FIELD_TYPE_LABEL_KEYS,
  fieldWidth,
  filterIsActive,
  ROW_NUMBER_COLUMN_WIDTH,
  readDensity,
  readHiddenFields,
  rowMatchesFilters,
  rowMatchesSearch,
  sortedFields,
  sortedRows,
  sortRows,
  writeDensity,
  writeHiddenFields,
} from "@/components/data-table/data-table-format";
import {
  DataTableToolbar,
  FilterConditionChip,
} from "@/components/data-table/data-table-toolbar";
import FieldOptionsDialog from "@/components/data-table/field-options-dialog";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
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
  createDataTableRow,
  getTableRowPage,
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
  SelectChoice,
} from "@/types/data-table";

type Props = {
  table: DataTable;
  organizationId: string;
  canEdit: boolean;
  onRename: () => void;
  onDelete: () => void;
};

// Quantities right-align (header and cell) so digits line up; dates don't.
const NUMERIC_CELL_TYPES: DataTableFieldType[] = [
  "number",
  "percent",
  "currency",
];

function FieldHeader({
  field,
  stickyLeft,
  sort,
  onSort,
  canEdit,
  canHide,
  organizationId,
  tableId,
  onEditOptions,
  onFilter,
  onHide,
  onDeleted,
}: {
  field: DataTableField;
  stickyLeft: number | null;
  sort: ColumnSort | null;
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
}) {
  const { t } = useTranslation();
  const { updateField } = useDataTableMutations(organizationId, tableId);
  const sorted = sort?.fieldId === field.id;
  const unit = currencyUnit(field);
  const numeric = NUMERIC_CELL_TYPES.includes(field.type);

  const changeType = async (next: DataTableFieldType) => {
    if (next === field.type) return;
    const needsEditor =
      ((next === "select" || next === "multiselect") &&
        !field.options?.choices?.length) ||
      (next === "currency" && !field.options?.code);
    if (needsEditor) return onEditOptions(field, next);
    try {
      await updateField.mutateAsync({
        organizationId,
        tableId,
        fieldId: field.id,
        type: next,
      });
    } catch {
      toast.error(t("navigation:tables.renameFieldError"));
    }
  };

  return (
    <div
      role="columnheader"
      aria-sort={
        sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "flex min-w-0 border-r border-b bg-background",
        stickyLeft !== null && "sticky z-10",
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
              className="group/head relative flex h-8 min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-xs text-muted-foreground outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-secondary data-popup-open:text-foreground"
            />
          }
        >
          {/* Quantities right-align: icon + name + unit sit together over the digits. */}
          {numeric && <span className="flex-1" />}
          <FieldTypeIcon type={field.type} />
          <span className="min-w-0 truncate font-medium">{field.name}</span>
          {unit && <span className="shrink-0">{unit}</span>}
          {!numeric && <span className="flex-1" />}
          {sorted &&
            (sort.dir === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0" />
            ) : (
              <ArrowDown className="size-3.5 shrink-0" />
            ))}
          {/* Hover swaps meta, never data: the chevron overlays the unit/sort end, so
              the name and digits never shift. */}
          <span className="absolute inset-y-0 right-0 hidden items-center bg-row-hover px-1.5 group-hover/head:flex group-data-popup-open/head:flex group-data-popup-open/head:bg-secondary">
            <ChevronDown className="size-3.5" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {canEdit && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => onEditOptions(field, null)}>
                  <Pencil className="size-3.5" />
                  {t("navigation:tables.editField")}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FieldTypeIcon type={field.type} />
                    {t("navigation:tables.changeType")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {EDITABLE_FIELD_TYPES.filter(
                      (type) => type !== field.type,
                    ).map((type) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => changeType(type)}
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
            <DropdownMenuItem
              onClick={() => onSort({ fieldId: field.id, dir: "asc" })}
            >
              <ArrowUp className="size-3.5" />
              {t("navigation:tables.sortAscending")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSort({ fieldId: field.id, dir: "desc" })}
            >
              <ArrowDown className="size-3.5" />
              {t("navigation:tables.sortDescending")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilter(field)}>
              <ListFilter className="size-3.5" />
              {t("navigation:tables.filterByField")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {(canHide || canEdit) && <DropdownMenuSeparator />}
          <DropdownMenuGroup>
            {canHide && (
              <DropdownMenuItem onClick={() => onHide(field)}>
                <EyeOff className="size-3.5" />
                {t("navigation:tables.hideField")}
              </DropdownMenuItem>
            )}
            {canEdit && (
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
    </div>
  );
}

export function DataTableGrid({
  table,
  organizationId,
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

  const allFields = useMemo(() => sortedFields(table.fields), [table.fields]);
  const fieldsById = useMemo(
    () => new Map(allFields.map((field) => [field.id, field])),
    [allFields],
  );
  const rows = useMemo(() => sortedRows(table.rows), [table.rows]);

  // Row pages fetched through Load-more; reset when a different table loads.
  const [appendedRows, setAppendedRows] = useState<DataTableRow[]>([]);
  const [loadedTableId, setLoadedTableId] = useState(table.id);
  if (loadedTableId !== table.id) {
    setLoadedTableId(table.id);
    setAppendedRows([]);
  }
  const allRows = useMemo(
    () => [...rows, ...appendedRows],
    [rows, appendedRows],
  );

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DataTableFilter[]>([]);
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const [density, setDensity] = useState<Density>(() => readDensity());
  const [hidden, setHidden] = useState<string[]>(() =>
    readHiddenFields(table.id),
  );
  const changeHidden = (ids: string[]) => {
    setHidden(ids);
    writeHiddenFields(table.id, ids);
  };
  // The first field names the row and is never hidden (Fields popover locks it).
  const fields = useMemo(
    () => allFields.filter((f, i) => i === 0 || !hidden.includes(f.id)),
    [allFields, hidden],
  );
  const [editing, setEditing] = useState<{
    rowId: string;
    fieldId: string;
  } | null>(null);
  const [dialogField, setDialogField] = useState<DataTableField | null>(null);
  const [dialogType, setDialogType] = useState<DataTableFieldType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<DataTableRow | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<DataTableField | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);

  const activeFilters = useMemo(
    () => filters.filter(filterIsActive),
    [filters],
  );
  const visibleRows = useMemo(
    () =>
      sortRows(
        allRows.filter(
          (row) =>
            rowMatchesSearch(row, allFields, search) &&
            rowMatchesFilters(row, fieldsById, activeFilters),
        ),
        allFields,
        sort,
      ),
    [allRows, allFields, fieldsById, search, activeFilters, sort],
  );

  const rowHeight = DENSITY_ROW_HEIGHT[density];
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => visibleRows[index]?.id ?? index,
    overscan: 8,
  });
  // Fixed row heights change with density; drop the size cache so the new
  // estimate is picked up without a remount.
  useEffect(() => {
    // rowHeight is intentional: the virtualizer instance is stable across
    // option updates, so measure() must be re-run when density changes.
    if (rowHeight) virtualizer.measure();
  }, [virtualizer, rowHeight]);

  const commitCell = async (
    row: DataTableRow,
    field: DataTableField,
    value: unknown,
  ) => {
    setEditing(null);
    try {
      await upsertCell.mutateAsync({
        organizationId,
        tableId: table.id,
        rowId: row.id,
        fieldId: field.id,
        value,
      });
    } catch {
      toast.error(t("navigation:tables.saveCellError"));
    }
  };

  const addRow = async () => {
    try {
      await createRow.mutateAsync({ organizationId, tableId: table.id });
    } catch {
      toast.error(t("navigation:tables.addRowError"));
    }
  };

  // CSV round-trip: export the filtered view, import maps headers to fields
  // by name and leans on the row endpoint's server-side coercion.
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const choicesById = useMemo(() => {
    const map = new Map<string, SelectChoice>();
    for (const field of allFields) {
      for (const choice of field.options?.choices ?? []) {
        map.set(choice.id, choice);
      }
    }
    return map;
  }, [allFields]);

  const memberByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of memberRows) {
      const name = member.user.name || member.user.email;
      if (name) map.set(name.toLowerCase(), member.userId || member.id);
    }
    return map;
  }, [memberRows]);

  const exportCsv = () => {
    const csv = csvSerialize(allFields, visibleRows, choicesById, memberByName);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${table.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const byName = new Map(allFields.map((field) => [field.name, field]));
    const parsed = csvParse(await file.text());
    const header = parsed[0] ?? [];
    const columns = header
      .map((name) => byName.get(name.trim()))
      .filter((field): field is DataTableField => Boolean(field));
    const dataRows = parsed
      .slice(1)
      .filter((cells) => cells.some((cell) => cell.trim() !== ""));
    let done = 0;
    try {
      for (const cells of dataRows) {
        const values: Record<string, unknown> = {};
        columns.forEach((field, index) => {
          const text = (cells[index] ?? "").trim();
          if (text === "") return;
          if (
            field.type === "number" ||
            field.type === "percent" ||
            field.type === "currency"
          ) {
            const n = Number(text);
            if (!Number.isNaN(n)) values[field.id] = n;
          } else if (field.type === "checkbox") {
            values[field.id] = ["true", "yes", "1"].includes(
              text.toLowerCase(),
            );
          } else if (field.type === "select") {
            const choice = field.options?.choices?.find(
              (c) => c.label.toLowerCase() === text.toLowerCase(),
            );
            if (choice) values[field.id] = choice.id;
          } else if (field.type === "multiselect") {
            const ids = text
              .split(",")
              .map((label) => {
                const choice = field.options?.choices?.find(
                  (c) => c.label.toLowerCase() === label.trim().toLowerCase(),
                );
                return choice?.id;
              })
              .filter(Boolean);
            if (ids.length > 0) values[field.id] = ids;
          } else if (field.type === "user") {
            const userId = memberByName.get(text.toLowerCase());
            if (userId) values[field.id] = userId;
          } else if (field.type === "json") {
            try {
              values[field.id] = JSON.parse(text);
            } catch {
              values[field.id] = text;
            }
          } else {
            values[field.id] = text;
          }
        });
        await createDataTableRow({ organizationId, tableId: table.id, values });
        done += 1;
        setImportProgress(
          t("navigation:tables.importing", { done, total: dataRows.length }),
        );
      }
      await queryClient.invalidateQueries({
        queryKey: dataTableKeys.detail(organizationId, table.id),
      });
      toast.success(t("navigation:tables.importDone", { count: done }));
    } catch {
      toast.error(t("navigation:tables.importError", { done }));
    } finally {
      setImportProgress(null);
    }
  };

  const confirmDeleteRow = async () => {
    if (!rowToDelete) return;
    const row = rowToDelete;
    setRowToDelete(null);
    try {
      await deleteRowMutation.mutateAsync({
        organizationId,
        tableId: table.id,
        rowId: row.id,
      });
    } catch {
      toast.error(t("navigation:tables.deleteRowError"));
    }
  };

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
      setFilters((current) => current.filter((f) => f.fieldId !== field.id));
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

  const filtersActive = search !== "" || activeFilters.length > 0;
  const narrowed = visibleRows.length !== allRows.length;
  const allLoaded = allRows.length >= table.total;

  // Grid template: row # · fields · trailing "+" add-field cell (DS §2 Grid).
  const ADD_FIELD_WIDTH = 40;
  const trailing = canEdit ? ADD_FIELD_WIDTH : 0;
  const gridTemplate = `${ROW_NUMBER_COLUMN_WIDTH}px ${fields
    .map((field) => `${fieldWidth(field.type)}px`)
    .join(" ")}${canEdit ? ` ${ADD_FIELD_WIDTH}px` : ""}`;
  const totalWidth =
    ROW_NUMBER_COLUMN_WIDTH +
    fields.reduce((sum, field) => sum + fieldWidth(field.type), 0) +
    trailing;

  return (
    <>
      <Layout.Toolbar>
        <DataTableToolbar
          fields={allFields}
          members={members}
          hidden={hidden}
          onHiddenChange={changeHidden}
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          search={search}
          onSearchChange={setSearch}
          density={density}
          onDensityChange={(next) => {
            setDensity(next);
            writeDensity(next);
          }}
          canEdit={canEdit}
          rowsInView={visibleRows.length}
          onAddRow={addRow}
          onAddField={() => openDialog(null, null)}
          onImport={() => fileInputRef.current?.click()}
          onExport={exportCsv}
          onRename={onRename}
          onDelete={onDelete}
        />
      </Layout.Toolbar>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importCsv(file);
        }}
      />

      {activeFilters.length > 0 && (
        <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-3">
          {activeFilters.map((filter) => {
            const field = fieldsById.get(filter.fieldId);
            if (!field) return null;
            return (
              <FilterConditionChip
                key={filter.id}
                filter={filter}
                field={field}
                members={members}
                onRemove={() =>
                  setFilters((current) =>
                    current.filter((item) => item.id !== filter.id),
                  )
                }
              />
            );
          })}
          <span className="flex-1" />
          <Button variant="ghost" size="xs" onClick={() => setFilters([])}>
            {t("navigation:tables.clearFilters")}
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {allFields.length === 0 ? (
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
                <Plus className="size-3.5" /> {t("navigation:tables.addField")}
              </Button>
            )}
          </Empty>
        ) : (
          <div
            className="flex min-h-full flex-col"
            style={{ minWidth: totalWidth }}
          >
            <div role="grid" aria-rowcount={visibleRows.length + 1}>
              <div
                role="row"
                className="sticky top-0 z-20 grid bg-background"
                style={{ gridTemplateColumns: gridTemplate, width: totalWidth }}
              >
                <div
                  role="columnheader"
                  aria-label={t("navigation:tables.rowNumber")}
                  className="sticky left-0 z-10 border-r border-b bg-background"
                />
                {fields.map((field, index) => (
                  <FieldHeader
                    key={field.id}
                    field={field}
                    stickyLeft={index === 0 ? ROW_NUMBER_COLUMN_WIDTH : null}
                    sort={sort}
                    onSort={setSort}
                    canEdit={canEdit}
                    canHide={index > 0}
                    organizationId={organizationId}
                    tableId={table.id}
                    onEditOptions={(target, presetType) =>
                      openDialog(target, presetType)
                    }
                    onFilter={(target) =>
                      setFilters((current) => [
                        ...current,
                        defaultFilterFor(target),
                      ])
                    }
                    onHide={(target) => changeHidden([...hidden, target.id])}
                    onDeleted={setFieldToDelete}
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
                        setFilters([]);
                      }}
                    >
                      {t("common:actions.clearAllFilters")}
                    </Button>
                  ) : (
                    canEdit && (
                      <Button variant="outline" size="sm" onClick={addRow}>
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
                    const row = visibleRows[item.index];
                    const rowIndex = item.index;
                    return (
                      <div
                        key={row.id}
                        role="row"
                        aria-rowindex={rowIndex + 2}
                        className="group absolute left-0 grid bg-background hover:bg-row-hover"
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
                          className="sticky left-0 z-10 flex items-center justify-center border-r border-b bg-background text-xs tabular-nums text-muted-foreground group-hover:bg-row-hover"
                        >
                          <span className="group-focus-within:hidden group-hover:hidden">
                            {rowIndex + 1}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              aria-label={t("navigation:tables.deleteRow")}
                              title={t("navigation:tables.deleteRow")}
                              className="hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive-foreground group-focus-within:flex group-hover:flex"
                              onClick={() => setRowToDelete(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                        {fields.map((field, fieldIndex) => (
                          <div
                            key={field.id}
                            role="gridcell"
                            aria-label={t("navigation:tables.cellAria", {
                              field: field.name,
                              row: rowIndex + 1,
                            })}
                            className={cn(
                              "flex min-w-0 items-center gap-1.5 border-r border-b bg-background px-2 text-ui group-hover:bg-row-hover",
                              NUMERIC_CELL_TYPES.includes(field.type) &&
                                "justify-end",
                              fieldIndex === 0 && "sticky z-[5] font-medium",
                            )}
                            style={
                              fieldIndex === 0
                                ? { left: ROW_NUMBER_COLUMN_WIDTH }
                                : undefined
                            }
                          >
                            <DataTableCellContent
                              row={row}
                              field={field}
                              members={members}
                              canEdit={canEdit}
                              isEditing={
                                editing?.rowId === row.id &&
                                editing?.fieldId === field.id
                              }
                              onEditStart={() =>
                                setEditing({ rowId: row.id, fieldId: field.id })
                              }
                              onEditEnd={() => setEditing(null)}
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
                onClick={addRow}
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

            {/* Sticky footer: honest count (DS rule 4). */}
            <div className="sticky bottom-0 left-0 flex h-8 shrink-0 items-center gap-3 border-t bg-background px-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {narrowed ? (
                  <Trans
                    i18nKey={
                      allLoaded
                        ? "navigation:tables.rowsOfTotal"
                        : "navigation:tables.rowsOfLoaded"
                    }
                    values={{
                      shown: visibleRows.length,
                      total: allLoaded ? table.total : allRows.length,
                    }}
                    components={{
                      b: <span className="font-medium text-foreground" />,
                    }}
                  />
                ) : (
                  <Trans
                    i18nKey={
                      allLoaded
                        ? "navigation:tables.rowsTotal"
                        : "navigation:tables.rowsLoaded"
                    }
                    values={{ count: allRows.length, total: table.total }}
                    components={{
                      b: <span className="font-medium text-foreground" />,
                    }}
                  />
                )}
              </span>
              {!allLoaded && (
                <button
                  type="button"
                  className="font-medium text-primary-soft-foreground hover:underline disabled:opacity-60"
                  disabled={loadingMore}
                  onClick={async () => {
                    setLoadingMore(true);
                    try {
                      const page = await getTableRowPage(
                        table.id,
                        organizationId,
                        allRows.length,
                      );
                      setAppendedRows((current) => [
                        ...current,
                        ...page.rows.filter(
                          (row) => !allRows.some((r) => r.id === row.id),
                        ),
                      ]);
                    } finally {
                      setLoadingMore(false);
                    }
                  }}
                >
                  {t("navigation:tables.loadMore")}
                </button>
              )}
              {importProgress && <span>{importProgress}</span>}
            </div>
          </div>
        )}
      </div>

      <FieldOptionsDialog
        organizationId={organizationId}
        tableId={table.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={dialogField}
        initialType={dialogType}
      />

      <AlertDialog
        open={rowToDelete !== null}
        onOpenChange={(open) => !open && setRowToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:tables.deleteRow")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:tables.deleteRowConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" size="sm" render={<AlertDialogClose />}>
              {t("navigation:tables.cancel")}
            </Button>
            <Button size="sm" onClick={confirmDeleteRow}>
              {t("navigation:tables.deleteRow")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  );
}
