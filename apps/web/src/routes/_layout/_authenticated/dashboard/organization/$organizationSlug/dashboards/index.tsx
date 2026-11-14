import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ChartPie,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureTablesStrings } from "@/lib/i18n";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

import OrganizationLayout from "@/components/common/organization-layout";
import CreateDashboardModal from "@/components/dashboard/create-dashboard-modal";
import DeleteDashboardDialog from "@/components/dashboard/delete-dashboard-dialog";
import PageTitle from "@/components/page-title";
import PermissionDenied from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  useDashboardDetails,
  useDashboardMutations,
  useDashboards,
} from "@/hooks/dashboards/use-dashboards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/dashboards/",
)({
  component: DashboardsIndexRoute,
});

function DashboardsIndexRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationSlug } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const tablesEnabled = Boolean(
    (
      activeOrganization as
        | (typeof activeOrganization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const { canCreateBoards, canUpdateBoards } = useOrganizationPermission();
  const canCreate = canCreateBoards();
  const canEdit = canUpdateBoards();
  const {
    data: dashboards = [],
    isLoading,
    isError,
    refetch,
  } = useDashboards(organizationId, tablesEnabled);
  const details = useDashboardDetails(
    organizationId,
    dashboards.map((dashboard) => dashboard.id),
    tablesEnabled,
  );
  const { deleteDashboard } = useDashboardMutations(organizationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (!activeOrganization) return null;
  if (!tablesEnabled) return <PermissionDenied />;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDashboard.mutateAsync({
        organizationId,
        dashboardId: deleteTarget.id,
      });
      toast.success(t("navigation:dashboards.deleted"));
    } catch {
      toast.error(t("navigation:dashboards.deleteError"));
    }
    setDeleteTarget(null);
  };

  return (
    <OrganizationLayout
      title={t("navigation:dashboards.title")}
      headerActions={
        canCreate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> {t("navigation:dashboards.create")}
          </Button>
        ) : null
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <PageTitle title={t("navigation:dashboards.title")} hideAppName />
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
            <div className="h-28 animate-pulse rounded-lg border bg-muted/40" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm p-8 text-center">
              <AlertCircle className="mx-auto mb-3 size-8 text-destructive" />
              <h2 className="font-semibold">
                {t("navigation:dashboards.loadError")}
              </h2>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => refetch()}
              >
                {t("navigation:dashboards.retry")}
              </Button>
            </div>
          </div>
        ) : dashboards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ChartPie className="size-4" />
              </div>
              <h2 className="font-semibold">
                {t("navigation:dashboards.empty")}
              </h2>
              {!canCreate ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {t("navigation:dashboards.readOnlyEmpty")}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboards.map((dashboard) => {
              const detail = details.find(
                (query) => query.data?.id === dashboard.id,
              )?.data;
              return (
                <div
                  key={dashboard.id}
                  className="group flex items-center gap-2 rounded-lg border bg-card p-3 hover:bg-accent"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
                        params: {
                          organizationSlug,
                          dashboardId: dashboard.id,
                        },
                      })
                    }
                  >
                    <span className="block truncate font-medium">
                      {dashboard.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("navigation:dashboards.panelsCount", {
                        count: detail?.panels.length ?? 0,
                      })}
                    </span>
                  </button>
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("navigation:dashboards.tableMenu", {
                              name: dashboard.name,
                            })}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(dashboard)}
                        >
                          <Trash2 /> {t("navigation:dashboards.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <CreateDashboardModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
        />
        <DeleteDashboardDialog
          open={deleteTarget !== null}
          dashboardName={deleteTarget?.name ?? ""}
          isPending={deleteDashboard.isPending}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      </div>
    </OrganizationLayout>
  );
}
