import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Table2, Trash2 } from "lucide-react";
import { useState } from "react";
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
import {
  getRowsForTask,
  linkRowToTask,
  unlinkRowTask,
} from "@/fetchers/data-table/row-links";
import {
  useDataTable,
  useDataTables,
} from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

/**
 * Ticket resources: "Table rows" (design v3 S4). Lists the rows whose table
 * carries this ticket in their linked tickets, and links more from a picker.
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
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickTableId, setPickTableId] = useState<string | null>(null);
  const [pickRowId, setPickRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const groups = useQuery({
    queryKey: ["rows-for-task", taskId],
    queryFn: () => getRowsForTask({ organizationId, taskId }),
  });

  const { data: tables = [] } = useDataTables(organizationId, pickerOpen);
  const { data: activeOrganization } = useActiveOrganization();
  const organizationSlug = activeOrganization?.slug ?? "";
  const { canUpdateBoards } = useOrganizationPermission();
  const editable = canEdit && canUpdateBoards();

  // The detail endpoint carries fields + rows; the list endpoint has no fields.
  const detail = useDataTable(organizationId, pickerOpen ? pickTableId : "");
  const rows = detail;

  const link = useMutation({
    mutationFn: async () => {
      if (!pickTableId || !pickRowId) throw new Error("nothing picked");
      return linkRowToTask({
        organizationId,
        tableId: pickTableId,
        rowId: pickRowId,
        taskId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows-for-task", taskId] });
      setPickerOpen(false);
      setPickRowId(null);
      setSearch("");
    },
    onError: () => toast.error(t("navigation:tables.linkRowError")),
  });

  const unlink = useMutation({
    mutationFn: async (input: { tableId: string; rowId: string }) => {
      return unlinkRowTask({
        organizationId,
        tableId: input.tableId,
        rowId: input.rowId,
        taskId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows-for-task", taskId] });
    },
    onError: () => toast.error(t("navigation:tables.unlinkRowError")),
  });

  const candidates = (rows.data?.rows ?? []).filter(
    (row) =>
      !search ||
      JSON.stringify(row.values).toLowerCase().includes(search.toLowerCase()),
  );
  const primaryField = rows.data?.fields[0];

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

      {groups.isLoading
        ? null
        : (groups.data?.length ?? 0) === 0
          ? null
          : groups.data?.map((group) => (
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
                        disabled={unlink.isPending}
                        onClick={() =>
                          unlink.mutate({
                            tableId: group.tableId,
                            rowId: row.id,
                          })
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
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue
                  placeholder={t("navigation:tables.pickTable")}
                />
              </SelectTrigger>
              <SelectContent>
                {tables
                  .filter((candidate) => candidate.deletedAt === null)
                  .map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
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
              disabled={!pickRowId || link.isPending}
              onClick={() => link.mutate()}
            >
              {t("navigation:tables.linkTableRow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
