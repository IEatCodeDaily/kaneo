import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArchiveRestore,
  ChevronsUpDown,
  Table2,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationCrumbSelect from "@/components/common/header/organization-crumb-select";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { ensureTablesStrings } from "@/lib/i18n";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// The virtualized grid (virtualizer + editors) stays out of the entry chunk.
const DataTableGrid = lazy(() =>
  import("@/components/data-table/data-table-grid").then((m) => ({
    default: m.DataTableGrid,
  })),
);

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  useDataTable,
  useDataTableMutations,
  useDataTables,
} from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/table/$tableId",
)({ component: DataTableRoute });

/** Breadcrumb resource switcher: current table, other tables (DS §2 Page header). */
function TableCrumbSelect({
  organizationId,
  organizationSlug,
  tableId,
  name,
}: {
  organizationId: string;
  organizationSlug: string;
  tableId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: tables = [] } = useDataTables(organizationId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 gap-1.5 px-2 font-medium"
          />
        }
      >
        <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">
            {t("navigation:tables.title")}
          </DropdownMenuLabel>
          {tables
            .filter((table) => table.deletedAt === null)
            .map((table) => (
              <DropdownMenuItem
                key={table.id}
                disabled={table.id === tableId}
                onClick={() =>
                  navigate({
                    to: "/dashboard/organization/$organizationSlug/table/$tableId",
                    params: { organizationSlug, tableId: table.id },
                  })
                }
              >
                <Table2 className="size-3.5" />
                <span className="truncate">{table.name}</span>
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DataTableRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationSlug, tableId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const {
    data: table,
    isLoading,
    isError,
    refetch,
  } = useDataTable(organizationId, tableId);
  const { canUpdateBoards } = useOrganizationPermission();
  const canEdit = canUpdateBoards();
  const { updateTable, deleteTable, restoreTable, purgeTable } =
    useDataTableMutations(organizationId, tableId);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const saveName = async () => {
    const next = draftName.trim();
    setRenameOpen(false);
    if (!table || !next || next === table.name) return;
    try {
      await updateTable.mutateAsync({ organizationId, tableId, name: next });
    } catch {
      toast.error(t("navigation:tables.renameTableError"));
    }
  };

  const header = (
    <Layout.Header>
      <div className="flex min-w-0 items-center gap-1">
        <span className="hidden sm:contents">
          <OrganizationCrumbSelect />
          <span className="text-xs text-faint-foreground">/</span>
        </span>
        {table ? (
          <TableCrumbSelect
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            tableId={tableId}
            name={table.name}
          />
        ) : (
          <span className="h-4 w-32 animate-pulse rounded-sm bg-muted" />
        )}
      </div>
    </Layout.Header>
  );

  if (isLoading) {
    // Skeleton on the real scaffold: header, disabled toolbar, rows (DS §2 Loading).
    return (
      <Layout>
        {header}
        <Layout.Toolbar>
          <span className="h-4 w-56 animate-pulse rounded-sm bg-muted" />
        </Layout.Toolbar>
        <div className="flex flex-col">
          {SKELETON_ROWS.map((id) => (
            <div key={id} className="flex h-8 items-center border-b px-3">
              <span className="h-3 w-1/3 animate-pulse rounded-sm bg-muted" />
            </div>
          ))}
        </div>
      </Layout>
    );
  }
  if (isError || !table) {
    return (
      <Layout>
        {header}
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <AlertCircle className="mx-auto mb-3 size-4 text-destructive-foreground" />
            <h1 className="text-sm font-semibold">
              {t("navigation:tables.loadTableError")}
            </h1>
            <p className="mt-1 mb-4 text-ui text-muted-foreground">
              {t("navigation:tables.connectionHelp")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("navigation:tables.retry")}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const isDeleted = table.deletedAt !== null;

  return (
    <Layout>
      <PageTitle title={table.name} hideAppName />
      {header}
      {/* The scaffold owns padding: no padding or gap on the route root (DS rule 2). */}
      <div className="flex min-h-0 flex-1 flex-col">
        {isDeleted && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-primary-soft px-3 py-1.5 text-ui">
            <span className="min-w-0 flex-1">
              {t("navigation:tables.deletedBanner")}
            </span>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoreTable.isPending}
                  onClick={async () => {
                    try {
                      await restoreTable.mutateAsync({
                        organizationId,
                        tableId,
                      });
                    } catch {
                      toast.error(t("navigation:tables.deleteTableError"));
                    }
                  }}
                >
                  <ArchiveRestore className="size-3.5" />
                  {t("navigation:tables.restore")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setPurgeOpen(true)}
                >
                  {t("navigation:tables.purge")}
                </Button>
              </>
            )}
          </div>
        )}

        <Suspense
          fallback={
            <Layout.Toolbar>
              <span className="h-4 w-56 animate-pulse rounded-sm bg-muted" />
            </Layout.Toolbar>
          }
        >
          <DataTableGrid
            key={table.id}
            table={table}
            organizationId={organizationId}
            canEdit={canEdit && !isDeleted}
            onRename={() => {
              setDraftName(table.name);
              setRenameOpen(true);
            }}
            onDelete={() => setDeleteOpen(true)}
          />
        </Suspense>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-sm">
                {t("navigation:tables.renameTable")}
              </DialogTitle>
            </DialogHeader>
            <DialogPanel>
              <Input
                autoFocus
                value={draftName}
                aria-label={t("navigation:tables.tableName")}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </DialogPanel>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRenameOpen(false)}
              >
                {t("navigation:tables.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={!draftName.trim()}>
                {t("navigation:tables.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => !open && setDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:tables.deleteTable")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:tables.deleteTableConfirm", {
                name: table.name,
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
              onClick={async () => {
                setDeleteOpen(false);
                try {
                  await deleteTable.mutateAsync({ organizationId, tableId });
                  toast.success(t("navigation:tables.deleted"));
                  navigate({
                    to: "/dashboard/organization/$organizationSlug",
                    params: { organizationSlug },
                  });
                } catch {
                  toast.error(t("navigation:tables.deleteTableError"));
                }
              }}
            >
              {t("navigation:tables.deleteTable")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={purgeOpen}
        onOpenChange={(open) => !open && setPurgeOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("navigation:tables.purge")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:tables.purgeConfirm", { name: table.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" size="sm" render={<AlertDialogClose />}>
              {t("navigation:tables.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (purgeTable.isPending) return;
                setPurgeOpen(false);
                try {
                  await purgeTable.mutateAsync({ organizationId, tableId });
                  toast.success(t("navigation:tables.purged"));
                  navigate({
                    to: "/dashboard/organization/$organizationSlug",
                    params: { organizationSlug },
                  });
                } catch {
                  toast.error(t("navigation:tables.purgeError"));
                }
              }}
            >
              {t("navigation:tables.purge")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
