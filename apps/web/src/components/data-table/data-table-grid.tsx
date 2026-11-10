import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import { csvParse, csvSerialize } from "@/components/data-table/data-table-csv";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
import {
  type ColumnSort,
  type DataTableFilter,
  DENSITY_ROW_HEIGHT,
  type Density,
  defaultFilterFor,
  EDITABLE_FIELD_TYPES,
  FIELD_TYPE_LABEL_KEYS,
  fieldWidth,
  ROW_NUMBER_COLUMN_WIDTH,
  readDensity,
  rowMatchesFilters,
  rowMatchesSearch,
  type SortDir,
  sortedFields,
  sortedRows,
  sortRows,
  writeDensity,
} from "@/components/data-table/data-table-format";
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
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
};

const NUMERIC_CELL_TYPES: DataTableFieldType[] = [
  "number",
  "percent",
  "currency",
  "date",
  "datetime",
];

function FieldHeader({
  field,
  stickyLeft,
  sort,
  onSortChange,
  canEdit,
  organizationId,
  tableId,
  onEditOptions,
  onDeleted,
}: {
  field: DataTableField;
  stickyLeft: number | null;
  sort: ColumnSort | null;
  onSortChange: (fieldId: string) => void;
  canEdit: boolean;
  organizationId: string;
  tableId: string;
  onEditOptions: (
    field: DataTableField,
    presetType: DataTableFieldType | null,
  ) => void;
  onDeleted: (field: DataTableField) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(field.name);
  // Esc must cancel: blur fires save() with the stale draft closure, so the
  // cancel intent is flagged explicitly instead of relying on state timing.
  const renameCancelledRef = useRef(false);
  const { updateField } = useDataTableMutations(organizationId, tableId);
  useEffect(() => setName(field.name), [field.name]);

  const save = async () => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return setName(field.name);
    }
    const next = name.trim();
    if (!next || next === field.name) return setName(field.name);
    try {
      await updateField.mutateAsync({
        organizationId,
        tableId,
        fieldId: field.id,
        name: next,
      });
    } catch {
      setName(field.name);
      toast.error(t("navigation:tables.renameFieldError"));
    }
  };

  const sorted = sort?.fieldId === field.id;
  const sortTitle = sorted
    ? t(
        sort.dir === "asc"
          ? "navigation:tables.sortAsc"
          : "navigation:tables.sortDesc",
      )
    : t("navigation:tables.sortNone");
  const SortIcon = !sorted
    ? ArrowUpDown
    : sort.dir === "asc"
      ? ArrowUp
      : ArrowDown;

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
        "flex min-w-0 items-center gap-1 border-r px-2 py-1",
        stickyLeft !== null && "sticky z-10 bg-muted",
      )}
      style={stickyLeft !== null ? { left: stickyLeft } : undefined}
    >
      <FieldTypeIcon
        type={field.type}
        className="shrink-0 text-muted-foreground"
      />
      <Input
        unstyled
        value={name}
        disabled={!canEdit}
        aria-label={field.name}
        onChange={(event) => setName(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            renameCancelledRef.current = true;
            setName(field.name);
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:font-semibold"
      />
      <button
        type="button"
        title={sortTitle}
        aria-label={sortTitle}
        className={cn(
          "shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent",
          sorted && "text-primary",
        )}
        onClick={() => onSortChange(field.id)}
      >
        <SortIcon className="size-3" />
      </button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={t("navigation:tables.fieldOptions", {
                  name: field.name,
                })}
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 group-hover/head:opacity-100"
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FieldTypeIcon type={field.type} className="mr-2" />
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
                      <FieldTypeIcon type={type} className="mr-2" />
                      {t(FIELD_TYPE_LABEL_KEYS[type])}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => onEditOptions(field, null)}>
                <SlidersHorizontal className="mr-2 size-3.5" />
                {t("navigation:tables.fieldOptions", { name: field.name })}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDeleted(field)}
            >
              <Trash2 className="mr-2 size-3.5" />
              {t("navigation:tables.deleteField")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function FilterChip({
  filter,
  field,
  members,
  onChange,
  onRemove,
}: {
  filter: DataTableFilter;
  field: DataTableField;
  members: Map<string, MemberOption>;
  onChange: (next: DataTableFilter) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const tinyInput =
    "[&_[data-slot=input]]:h-5 [&_[data-slot=input]]:text-[11px]";

  let control: React.ReactNode = null;
  if ("contains" in filter) {
    control = (
      <Input
        unstyled
        value={filter.contains}
        onChange={(event) =>
          onChange({ ...filter, contains: event.target.value })
        }
        placeholder={t("navigation:tables.searchRows")}
        aria-label={field.name}
        className={cn(tinyInput, "[&_[data-slot=input]]:w-28")}
      />
    );
  } else if ("min" in filter) {
    control = (
      <span className="flex items-center gap-1">
        <Input
          unstyled
          type="number"
          value={filter.min}
          onChange={(event) => onChange({ ...filter, min: event.target.value })}
          placeholder="≥"
          aria-label={t("navigation:tables.optionMin")}
          className={cn(tinyInput, "[&_[data-slot=input]]:w-14")}
        />
        <Input
          unstyled
          type="number"
          value={filter.max}
          onChange={(event) => onChange({ ...filter, max: event.target.value })}
          placeholder="≤"
          aria-label={t("navigation:tables.optionMax")}
          className={cn(tinyInput, "[&_[data-slot=input]]:w-14")}
        />
      </span>
    );
  } else if ("from" in filter) {
    control = (
      <span className="flex items-center gap-1">
        <Input
          unstyled
          type="date"
          value={filter.from}
          onChange={(event) =>
            onChange({ ...filter, from: event.target.value })
          }
          aria-label={t("navigation:tables.optionMin")}
          className={tinyInput}
        />
        <Input
          unstyled
          type="date"
          value={filter.to}
          onChange={(event) => onChange({ ...filter, to: event.target.value })}
          aria-label={t("navigation:tables.optionMax")}
          className={tinyInput}
        />
      </span>
    );
  } else if ("checked" in filter) {
    control = (
      <button
        type="button"
        className="text-[11px] font-semibold hover:underline"
        onClick={() =>
          onChange({
            ...filter,
            checked:
              filter.checked === "any"
                ? "true"
                : filter.checked === "true"
                  ? "false"
                  : "any",
          })
        }
        aria-label={field.name}
      >
        {filter.checked === "any"
          ? ""
          : filter.checked === "true"
            ? t("navigation:dashboards.yes")
            : t("navigation:dashboards.no")}
      </button>
    );
  } else if ("choiceId" in filter) {
    const choiceLabel =
      filter.choiceId === "__empty__"
        ? t("navigation:tables.unassigned")
        : filter.choiceId === ""
          ? ""
          : field.type === "user"
            ? (members.get(filter.choiceId)?.user.name ?? filter.choiceId)
            : (field.options?.choices?.find(
                (choice) => choice.id === filter.choiceId,
              )?.label ?? filter.choiceId);
    control = (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-[11px] font-semibold hover:underline"
            aria-label={field.name}
          >
            {choiceLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1">
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {[
              { id: "", label: t("navigation:tables.selectChoice") },
              { id: "__empty__", label: t("navigation:tables.unassigned") },
              ...(field.type === "user"
                ? Array.from(members.values()).map((member) => ({
                    id: member.id,
                    label: member.user.name || member.user.email || member.id,
                  }))
                : (field.options?.choices ?? []).map((choice) => ({
                    id: choice.id,
                    label: choice.label,
                  }))),
            ].map((option) => (
              <button
                key={option.id || "any"}
                type="button"
                className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => onChange({ ...filter, choiceId: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-muted-foreground">
      <span className="flex items-center gap-1 text-[11px]">
        <FieldTypeIcon type={field.type} />
        {field.name}
      </span>
      {control}
      <button
        type="button"
        aria-label={t("navigation:tables.cancel")}
        className="rounded-full p-0.5 hover:bg-accent"
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

export function DataTableGrid({ table, organizationId, canEdit }: Props) {
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

  const fields = useMemo(() => sortedFields(table.fields), [table.fields]);
  const fieldsById = useMemo(
    () => new Map(fields.map((field) => [field.id, field])),
    [fields],
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

  const visibleRows = useMemo(
    () =>
      sortRows(
        allRows.filter(
          (row) =>
            rowMatchesSearch(row, fields, search) &&
            rowMatchesFilters(row, fieldsById, filters),
        ),
        fields,
        sort,
      ),
    [allRows, fields, fieldsById, search, filters, sort],
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

  const gridTemplate = `${ROW_NUMBER_COLUMN_WIDTH}px ${fields
    .map((field) => `${fieldWidth(field.type)}px`)
    .join(" ")}`;
  const totalWidth =
    ROW_NUMBER_COLUMN_WIDTH +
    fields.reduce((sum, field) => sum + fieldWidth(field.type), 0);

  const cycleSort = (fieldId: string) =>
    setSort((current) => {
      if (current?.fieldId !== fieldId) return { fieldId, dir: "asc" };
      if (current.dir === "asc") return { fieldId, dir: "desc" as SortDir };
      return null;
    });

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
    for (const field of fields) {
      for (const choice of field.options?.choices ?? []) {
        map.set(choice.id, choice);
      }
    }
    return map;
  }, [fields]);

  const memberByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of memberRows) {
      const name = member.user.name || member.user.email;
      if (name) map.set(name.toLowerCase(), member.userId || member.id);
    }
    return map;
  }, [memberRows]);

  const exportCsv = () => {
    const csv = csvSerialize(fields, visibleRows, choicesById, memberByName);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${table.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    const byName = new Map(fields.map((field) => [field.name, field]));
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

  const filtersActive = search !== "" || filters.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
        <div className="flex h-7 w-56 items-center gap-1.5 rounded-md border bg-background px-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            unstyled
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("navigation:tables.searchRows")}
            aria-label={t("navigation:tables.searchRows")}
            className="[&_[data-slot=input]]:h-5 [&_[data-slot=input]]:text-xs"
          />
        </div>
        {filters.map((filter) => {
          const field = fields.find((item) => item.id === filter.fieldId);
          if (!field) return null;
          return (
            <FilterChip
              key={filter.id}
              filter={filter}
              field={field}
              members={members}
              onChange={(next) =>
                setFilters((current) =>
                  current.map((item) => (item.id === filter.id ? next : item)),
                )
              }
              onRemove={() =>
                setFilters((current) =>
                  current.filter((item) => item.id !== filter.id),
                )
              }
            />
          );
        })}
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                <Plus className="size-3" />
                {t("common:actions.filter")}
              </button>
            }
          />
          <PopoverContent className="w-52 p-1">
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {fields.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    setFilters((current) => [
                      ...current,
                      defaultFilterFor(field),
                    ])
                  }
                >
                  <FieldTypeIcon type={field.type} />
                  <span className="min-w-0 flex-1 truncate">{field.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <span className="flex-1" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {t("navigation:tables.rowsCount", { count: visibleRows.length })} ·{" "}
          {t("navigation:tables.field", { count: fields.length })}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="xs">
                {t("navigation:tables.density")}:{" "}
                {t(
                  density === "compact"
                    ? "navigation:tables.densityCompact"
                    : "navigation:tables.densityComfortable",
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {(["compact", "comfortable"] as Density[]).map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => {
                  setDensity(option);
                  writeDensity(option);
                }}
              >
                {t(
                  option === "compact"
                    ? "navigation:tables.densityCompact"
                    : "navigation:tables.densityComfortable",
                )}
                {density === option && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {fields.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("navigation:tables.noFields")}
            </p>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDialog(null, null)}
              >
                <Plus className="size-4" /> {t("navigation:tables.addField")}
              </Button>
            )}
          </div>
        ) : (
          <div
            role="grid"
            aria-rowcount={visibleRows.length}
            style={{ minWidth: totalWidth }}
          >
            <div
              role="row"
              className="group/head sticky top-0 z-20 grid bg-muted/95 backdrop-blur"
              style={{
                gridTemplateColumns: gridTemplate,
                width: totalWidth,
              }}
            >
              <div
                role="columnheader"
                className="sticky left-0 z-10 flex items-center justify-center border-r bg-muted text-xs text-muted-foreground"
                style={{ width: ROW_NUMBER_COLUMN_WIDTH }}
              >
                #
              </div>
              {fields.map((field, index) => (
                <FieldHeader
                  key={field.id}
                  field={field}
                  stickyLeft={index === 0 ? ROW_NUMBER_COLUMN_WIDTH : null}
                  sort={sort}
                  onSortChange={cycleSort}
                  canEdit={canEdit}
                  organizationId={organizationId}
                  tableId={table.id}
                  onEditOptions={(target, presetType) =>
                    openDialog(target, presetType)
                  }
                  onDeleted={setFieldToDelete}
                />
              ))}
            </div>

            {visibleRows.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("navigation:tables.noRows")}
                </p>
                {filtersActive && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setSearch("");
                      setFilters([]);
                    }}
                  >
                    {t("common:actions.clearAllFilters")}
                  </Button>
                )}
                {rows.length === 0 && canEdit && (
                  <Button variant="outline" size="xs" onClick={addRow}>
                    <Plus className="size-3.5" />
                    {t("navigation:tables.addRow")}
                  </Button>
                )}
              </div>
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
                      className="group absolute left-0 grid border-b bg-card hover:bg-accent/30"
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
                        className="sticky left-0 z-10 flex items-center justify-center border-r bg-card text-[11px] tabular-nums text-muted-foreground group-hover:bg-accent/30"
                      >
                        <span className="group-hover:hidden">
                          {rowIndex + 1}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={t("navigation:tables.deleteRow")}
                            title={t("navigation:tables.deleteRow")}
                            className="hidden rounded p-0.5 text-destructive hover:bg-destructive/10 group-hover:block group-focus-within:block"
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
                            "flex min-w-0 items-center gap-1.5 border-r bg-card px-2.5 text-[13px] group-hover:bg-accent/30",
                            NUMERIC_CELL_TYPES.includes(field.type) &&
                              "justify-end",
                            fieldIndex === 0 && "sticky z-[5]",
                            fieldIndex === fields.length - 1 && "border-r-0",
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
                            onCommit={(value) => commitCell(row, field, value)}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {(canEdit || allRows.length < table.total) && (
              <div className="sticky bottom-0 flex items-center gap-4 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                {allRows.length < table.total && (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline disabled:opacity-60"
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
                {fields.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:underline"
                      onClick={exportCsv}
                    >
                      {t("navigation:tables.exportCsv")}
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:underline disabled:opacity-60"
                      disabled={importProgress !== null}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t("navigation:tables.importCsv")}
                    </button>
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
                    {importProgress && (
                      <span className="text-muted-foreground">
                        {importProgress}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                          onClick={addRow}
                        >
                          <Plus className="size-3.5" />
                          {t("navigation:tables.addRow")}
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:underline"
                          onClick={() => openDialog(null, null)}
                        >
                          <Plus className="size-3.5" />
                          {t("navigation:tables.addField")}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
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
    </div>
  );
}
