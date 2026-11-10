import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ChartPie,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import {
  DashboardGrid,
  GridPanel,
} from "@/components/dashboard/dashboard-grid";
import DeleteDashboardDialog from "@/components/dashboard/delete-dashboard-dialog";
import PageTitle from "@/components/page-title";
import PermissionDenied from "@/components/permission-denied";
import { ensureTablesStrings } from "@/lib/i18n";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

// Panels carry the chart renderers + editor; keep them out of the entry chunk.
const PanelCard = lazy(() =>
  import("@/components/dashboard/panel-card").then((m) => ({
    default: m.PanelCard,
  })),
);
const PanelEditorDialog = lazy(
  () => import("@/components/dashboard/panel-editor-dialog"),
);

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  useDashboard,
  useDashboardMutations,
} from "@/hooks/dashboards/use-dashboards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";
import type { DashboardPanelSpec } from "@/types/dashboards";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
)({
  component: DashboardDetailRoute,
});

function DashboardDetailRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationSlug, dashboardId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const tablesEnabled = Boolean(
    (
      activeOrganization as
        | (typeof activeOrganization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const canEdit = useOrganizationPermission().canUpdateBoards();
  const {
    data: dashboard,
    isLoading,
    isError,
    refetch,
  } = useDashboard(organizationId, dashboardId, tablesEnabled);
  const { updateDashboard, deleteDashboard } = useDashboardMutations(
    organizationId,
    dashboardId,
  );

  // Draft panels live here; every panel edit commits a PUT with the full list.
  const [draft, setDraft] = useState<DashboardPanelSpec[] | null>(null);
  const [editorState, setEditorState] = useState<
    { mode: "new" } | { mode: "edit"; panel: DashboardPanelSpec } | null
  >(null);
  const [panelDeleteTarget, setPanelDeleteTarget] =
    useState<DashboardPanelSpec | null>(null);
  const [dashboardDeleteOpen, setDashboardDeleteOpen] = useState(false);

  const serverPanels = dashboard?.panels ?? [];
  const panels = draft ?? serverPanels;
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(serverPanels);

  const commitPanels = async (next: DashboardPanelSpec[]) => {
    setDraft(next);
    try {
      await updateDashboard.mutateAsync({
        organizationId,
        dashboardId,
        panels: next,
      });
      setDraft(null);
      toast.success(t("navigation:dashboards.saved"));
    } catch {
      toast.error(t("navigation:dashboards.saveError"));
    }
  };

  const commitEditor = (panel: DashboardPanelSpec) => {
    const exists = panels.some((candidate) => candidate.id === panel.id);
    void commitPanels(
      exists
        ? panels.map((candidate) =>
            candidate.id === panel.id ? panel : candidate,
          )
        : [...panels, panel],
    );
  };

  const confirmPanelDelete = () => {
    if (!panelDeleteTarget) return;
    void commitPanels(
      panels.filter((candidate) => candidate.id !== panelDeleteTarget.id),
    );
    setPanelDeleteTarget(null);
  };

  const confirmDashboardDelete = async () => {
    try {
      await deleteDashboard.mutateAsync({ organizationId, dashboardId });
      toast.success(t("navigation:dashboards.deleted"));
      navigate({
        to: "/dashboard/organization/$organizationSlug/dashboards",
        params: { organizationSlug },
      });
    } catch {
      toast.error(t("navigation:dashboards.deleteError"));
    }
  };

  if (!activeOrganization) return null;
  if (!tablesEnabled) return <PermissionDenied />;

  if (isLoading) {
    return (
      <OrganizationLayout title={t("navigation:dashboards.title")}>
        <div className="flex h-full flex-col gap-5 p-6">
          <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 animate-pulse rounded-xl border bg-muted/40" />
        </div>
      </OrganizationLayout>
    );
  }
  if (isError || !dashboard) {
    return (
      <OrganizationLayout title={t("navigation:dashboards.title")}>
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-3 size-8 text-destructive" />
            <h1 className="font-semibold">
              {t("navigation:dashboards.loadPanelError")}
            </h1>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => refetch()}
            >
              {t("navigation:dashboards.retry")}
            </Button>
          </div>
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout title={dashboard.name}>
      <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
        <PageTitle title={dashboard.name} hideAppName />
        <header className="flex shrink-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ChartPie className="size-5" />
          </div>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">
            {dashboard.name}
          </h1>
          {/* Range/global-filter chips are placeholders until the query engine
            grows dashboard-scoped filters. */}
          <span className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
            {t("navigation:dashboards.range", { defaultValue: "Range" })} ·{" "}
            {t("navigation:dashboards.soon", { defaultValue: "Soon" })}
          </span>
          <span className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
            {t("navigation:dashboards.filters")} ·{" "}
            {t("navigation:dashboards.soon", { defaultValue: "Soon" })}
          </span>
          {canEdit ? (
            <>
              <Button
                variant="outline"
                onClick={() => setEditorState({ mode: "new" })}
              >
                <Plus /> {t("navigation:dashboards.addPanel")}
              </Button>
              <Button
                variant="outline"
                disabled={!dirty || updateDashboard.isPending}
                onClick={() => void commitPanels(panels)}
              >
                <Save />{" "}
                {updateDashboard.isPending
                  ? t("navigation:dashboards.saving")
                  : t("navigation:dashboards.save")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("navigation:dashboards.delete")}
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDashboardDeleteOpen(true)}
                  >
                    <Trash2 /> {t("navigation:dashboards.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </header>
        {panels.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <div>
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ChartPie className="size-6" />
              </div>
              <h2 className="font-semibold">
                {t("navigation:dashboards.noData")}
              </h2>
              {!canEdit ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {t("navigation:dashboards.readOnlyEmpty")}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <DashboardGrid>
            {panels.map((spec) => (
              <GridPanel key={spec.id} span={spec.span}>
                <Suspense
                  fallback={
                    <div className="h-32 animate-pulse rounded-lg bg-muted/50" />
                  }
                >
                  <PanelCard
                    spec={spec}
                    organizationId={organizationId}
                    canEdit={canEdit}
                    onEdit={(panel) => setEditorState({ mode: "edit", panel })}
                    onDelete={setPanelDeleteTarget}
                  />
                </Suspense>
              </GridPanel>
            ))}
          </DashboardGrid>
        )}
        {canEdit ? (
          <>
            <Suspense
              fallback={
                <span className="sr-only">
                  {t("navigation:dashboards.loading")}
                </span>
              }
            >
              <PanelEditorDialog
                open={editorState !== null}
                onClose={() => setEditorState(null)}
                organizationId={organizationId}
                panel={
                  editorState?.mode === "edit" ? editorState.panel : undefined
                }
                onCommit={commitEditor}
              />
            </Suspense>
            <DeleteDashboardDialog
              open={panelDeleteTarget !== null}
              dashboardName={panelDeleteTarget?.title ?? ""}
              isPending={updateDashboard.isPending}
              onConfirm={confirmPanelDelete}
              onClose={() => setPanelDeleteTarget(null)}
              title={t("navigation:dashboards.deletePanel")}
              description={panelDeleteTarget?.title}
            />
          </>
        ) : null}
        <DeleteDashboardDialog
          open={dashboardDeleteOpen}
          dashboardName={dashboard.name}
          isPending={deleteDashboard.isPending}
          onConfirm={() => void confirmDashboardDelete()}
          onClose={() => setDashboardDeleteOpen(false)}
        />
      </div>
    </OrganizationLayout>
  );
}
