import { Link } from "@tanstack/react-router";
import { Table2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { getDataTable, getDataTables } from "@/fetchers/data-table/data-table";
import {
  getRowsForTask,
  linkRowToTask,
  unlinkRowTask,
} from "@/fetchers/data-table/row-links";
import { toast } from "@/lib/toast";
import type { DataTable } from "@/types/data-table";

type Group = {
  tableId: string;
  tableName: string;
  rows: { id: string; primary: string | null }[];
};

/**
 * Ticket resources: "Table rows" (design v3 S4). Lists the rows whose table
 * carries this ticket in their linked tickets, and links more from a picker.
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

  const editable = canEdit;

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
    getDataTables(organizationId)
      .then((all) =>
        setTables(all.filter((candidate) => candidate.deletedAt === null)),
      )
      .catch(() => setTables([]));
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

  const primaryField = detail?.fields[0];
  const candidates = (detail?.rows ?? []).filter((row) => {
    if (pickRowId === row.id) return false;
    if (!search) return true;
    const primary = primaryField
      ? String(row.values[primaryField.id] ?? "")
      : row.id;
    return primary.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-0.5" data-slot="task-table-rows">
      <div className="flex items-center justify-between gap-2 px-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <Table2 className="size-3.5" />
          {t("navigation:tables.tableRowsSection")}
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

      {linkedTables.map((group) => (
        <div key={group.tableId} className="flex flex-col gap-0.5">
          <span className="px-2 text-xs text-muted-foreground">
            {group.tableName}
          </span>
          {group.rows.map((row) => (
            <div
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60"
              key={row.id}
            >
              <Link
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm hover:text-primary-soft-foreground hover:underline"
                params={{
                  organizationSlug,
                  tableId: group.tableId,
                }}
                to="/dashboard/organization/$organizationSlug/table/$tableId"
              >
                <span className="min-w-0 truncate">
                  {row.primary || row.id}
                </span>
              </Link>
              {editable && (
                <Button
                  aria-label={t("navigation:tables.unlinkTableRow")}
                  className="opacity-0 group-hover:opacity-100"
                  disabled={busy}
                  onClick={() =>
                    applyUnlink({ tableId: group.tableId, rowId: row.id })
                  }
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}

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
