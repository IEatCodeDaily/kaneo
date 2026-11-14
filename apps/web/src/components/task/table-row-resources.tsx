import { Link } from "@tanstack/react-router";
import { Table2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FieldTypeIcon,
  type MemberOption,
} from "@/components/data-table/data-table-cells";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
import { TicketLookupContext } from "@/components/data-table/ticket-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDataTable,
  getDataTables,
  upsertDataTableCell,
} from "@/fetchers/data-table/data-table";
import {
  getRowsForTask,
  linkRowToTask,
  type TableRowGroup,
  unlinkRowTask,
} from "@/fetchers/data-table/row-links";
import getActiveOrganizationMembers from "@/fetchers/organization-member/get-active-organization-members";
import { cn } from "@/lib/cn";
import { ensureTablesStrings } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
} from "@/types/data-table";

type Group = TableRowGroup["tables"][number];

// The section renders lazy-bundle strings on any ticket page.
void ensureTablesStrings();

/**
 * Ticket "Included in": every table row that includes this ticket (explicit
 * link or a ticket cell holding it), with all of the row's field values —
 * editable in place for table editors. Rows act as custom fields, so the
 * ticket primitive never grows per-team columns.
 * Fetches directly instead of via react-query: the surrounding resources
 * section is also mounted by tests that provide no QueryClientProvider.
 */
export function TableRowResources({
  taskId,
  organizationId,
  canEdit,
}: {
  taskId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [linkedTables, setLinkedTables] = useState<Group[]>([]);
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickTableId, setPickTableId] = useState<string | null>(null);
  const [pickRowId, setPickRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<DataTable | null>(null);
  const [tables, setTables] = useState<
    { id: string; name: string; deletedAt: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Map<string, MemberOption>>(
    () => new Map(),
  );
  const [editing, setEditing] = useState<{
    rowId: string;
    fieldId: string;
  } | null>(null);

  const editable = canEdit;

  useEffect(() => {
    if (!organizationId || linkedTables.length === 0) return;
    let cancelled = false;
    getActiveOrganizationMembers({ organizationId })
      .then((data) => {
        if (cancelled) return;
        // better-auth types listMembers as {members, total} | [].
        const rows = Array.isArray(data) ? data : (data?.members ?? []);
        setMembers(new Map(rows.map((m) => [m.userId || m.id, m])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [organizationId, linkedTables.length]);

  useEffect(() => {
    if (!taskId || !organizationId) return;
    let cancelled = false;
    getRowsForTask({ organizationId, taskId })
      .then((data) => {
        if (cancelled) return;
        setLinkedTables(data.tables);
        setOrganizationSlug(data.organizationSlug);
      })
      .catch(() => {
        // An empty section is the honest fallback; list failures here are not
        // actionable for the user.
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getDataTables(organizationId)
      .then((all) => {
        if (cancelled) return;
        setTables(all.filter((candidate) => candidate.deletedAt === null));
      })
      .catch(() => {
        if (!cancelled) setTables([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!pickerOpen || !pickTableId || !organizationId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    getDataTable(pickTableId, organizationId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, pickTableId, organizationId]);

  const reload = () => {
    getRowsForTask({ organizationId, taskId })
      .then((data) => {
        setLinkedTables(data.tables);
        setOrganizationSlug(data.organizationSlug);
      })
      .catch(() => {});
  };

  const applyLink = async () => {
    if (!pickTableId || !pickRowId) return;
    setBusy(true);
    try {
      await linkRowToTask({
        organizationId,
        tableId: pickTableId,
        rowId: pickRowId,
        taskId,
      });
      setPickerOpen(false);
      setPickRowId(null);
      setSearch("");
      reload();
    } catch {
      toast.error(t("navigation:tables.linkRowError"));
    } finally {
      setBusy(false);
    }
  };

  const applyUnlink = async (input: { tableId: string; rowId: string }) => {
    setBusy(true);
    try {
      await unlinkRowTask({
        organizationId,
        tableId: input.tableId,
        rowId: input.rowId,
        taskId,
      });
      reload();
    } catch {
      toast.error(t("navigation:tables.unlinkRowError"));
    } finally {
      setBusy(false);
    }
  };

  const commitCell = async (
    group: Group,
    row: DataTableRow,
    field: DataTableField,
    value: unknown,
  ) => {
    setEditing(null);
    try {
      const updated = await upsertDataTableCell({
        organizationId,
        tableId: group.tableId,
        rowId: row.id,
        fieldId: field.id,
        value,
      });
      setLinkedTables((current) =>
        current.map((candidate) =>
          candidate.tableId !== group.tableId
            ? candidate
            : {
                ...candidate,
                tickets: { ...candidate.tickets, ...updated.tickets },
                rows: candidate.rows.map((r) =>
                  r.id === row.id ? { ...r, values: updated.values } : r,
                ),
              },
        ),
      );
    } catch {
      toast.error(t("navigation:tables.saveCellError"));
    }
  };

  const primaryField = detail?.fields[0];
  const candidates = (detail?.rows ?? []).filter((row) => {
    if (pickRowId === row.id) return false;
    if (!search) return true;
    const primary = primaryField
      ? String(row.values[primaryField.id] ?? "")
      : row.id;
    return primary.toLowerCase().includes(search.toLowerCase());
  });

  // Tables off (or none exist): no section rather than an empty prompt.
  if (tables.length === 0 && linkedTables.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5" data-slot="task-table-rows">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Table2 className="size-3.5" />
          {t("navigation:tables.includedIn")}
        </span>
        {editable && (
          <Button
            onClick={() => setPickerOpen(true)}
            size="icon-xs"
            variant="ghost"
          >
            <Table2 className="size-3.5" />
            <span className="sr-only">
              {t("navigation:tables.linkTableRow")}
            </span>
          </Button>
        )}
      </div>

      {linkedTables.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {t("navigation:tables.notIncluded")}
        </p>
      )}

      {linkedTables.flatMap((group) =>
        group.rows.map((row) => {
          const [primary, ...rest] = group.fields;
          const title = primary ? String(row.values[primary.id] ?? "") : "";
          return (
            <TicketLookupContext.Provider
              key={`${group.tableId}:${row.id}`}
              value={{
                organizationSlug,
                organizationId,
                tableId: group.tableId,
                tickets: group.tickets,
              }}
            >
              <div className="flex flex-col py-1" data-slot="included-in-row">
                <div className="group flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-accent/60">
                  <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {group.tableName}
                  </span>
                  <span className="text-xs text-faint-foreground">/</span>
                  <Link
                    className="min-w-0 flex-1 truncate text-ui font-medium hover:underline"
                    params={{ organizationSlug, tableId: group.tableId }}
                    to="/dashboard/organization/$organizationSlug/table/$tableId"
                  >
                    {title || t("navigation:tables.untitledRow")}
                  </Link>
                  {editable && group.canEdit && row.linked && (
                    <Button
                      aria-label={t("navigation:tables.unlinkTableRow")}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      disabled={busy}
                      onClick={() =>
                        applyUnlink({ tableId: group.tableId, rowId: row.id })
                      }
                      size="icon-xs"
                      variant="ghost"
                    >
                      <Unlink className="size-3.5" />
                    </Button>
                  )}
                </div>
                {rest.map((field) => (
                  <div
                    key={field.id}
                    className="flex min-h-7 items-center gap-2 rounded-md pr-2 pl-7 hover:bg-accent/40"
                  >
                    <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <FieldTypeIcon type={field.type} />
                      <span className="truncate">{field.name}</span>
                    </span>
                    <div
                      className={cn(
                        "flex min-h-7 min-w-0 flex-1 items-center text-ui",
                        ["number", "percent", "currency"].includes(
                          field.type,
                        ) && "justify-end",
                      )}
                    >
                      <DataTableCellContent
                        row={row}
                        field={field}
                        members={members}
                        canEdit={editable && group.canEdit}
                        isEditing={
                          editing?.rowId === row.id &&
                          editing.fieldId === field.id
                        }
                        onEditStart={() =>
                          setEditing({ rowId: row.id, fieldId: field.id })
                        }
                        onEditEnd={() => setEditing(null)}
                        onCommit={(value) =>
                          commitCell(group, row, field, value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TicketLookupContext.Provider>
          );
        }),
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t("navigation:tables.linkTableRow")}
            </DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-2">
            <Select
              value={pickTableId}
              onValueChange={(next) => {
                setPickTableId(String(next ?? ""));
                setPickRowId(null);
                setSearch("");
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder={t("navigation:tables.pickTable")} />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pickTableId && (
              <>
                <Input
                  size="sm"
                  value={search}
                  placeholder={t("navigation:tables.searchRows")}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="max-h-60 overflow-y-auto">
                  {candidates.slice(0, 50).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-ui hover:bg-accent"
                      onClick={() => setPickRowId(row.id)}
                    >
                      <span className="truncate">
                        {primaryField
                          ? String(row.values[primaryField.id] ?? row.id)
                          : row.id}
                      </span>
                    </button>
                  ))}
                  {candidates.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      {t("navigation:tables.noMatches")}
                    </p>
                  )}
                </div>
              </>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(false)}
            >
              {t("navigation:tables.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!pickRowId || busy}
              onClick={() => applyLink()}
            >
              {t("navigation:tables.linkTableRow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
