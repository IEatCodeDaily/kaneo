import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ChartPie,
  ChevronsUpDown,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import Layout from "@/components/common/layout";
import OrganizationCrumbSelect from "@/components/common/header/organization-crumb-select";
import {
  DashboardGrid,
  GridPanel,
} from "@/components/dashboard/dashboard-grid";
import DeleteDashboardDialog from "@/components/dashboard/delete-dashboard-dialog";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  useDashboard,
  useDashboardMutations,
  useDashboards,
} from "@/hooks/dashboards/use-dashboards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";
import type { DashboardPanelSpec } from "@/types/dashboards";

/** Breadcrumb resource switcher: current dashboard, other dashboards. */
function DashboardCrumbSelect({
  organizationSlug,
  dashboardId,
  name,
}: {
  organizationSlug: string;
  dashboardId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: dashboards = [] } = useDashboards(organizationId);
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
        <ChartPie className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">
            {t("navigation:dashboards.title")}
          </DropdownMenuLabel>
          {dashboards.map((candidate) => (
            <DropdownMenuItem
              key={candidate.id}
              disabled={candidate.id === dashboardId}
              onClick={() =>
                navigate({
                  to: "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
                  params: {
                    organizationSlug,
                    dashboardId: candidate.id,
                  },
                })
              }
            >
              <ChartPie className="size-3.5" />
              <span className="truncate">{candidate.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  const header = (
    <Layout.Header>
      <div className="flex min-w-0 items-center gap-1">
        <span className="hidden sm:contents">
          <OrganizationCrumbSelect />
          <span className="text-xs text-faint-foreground">/</span>
        </span>
        {dashboard ? (
          <DashboardCrumbSelect
            organizationSlug={organizationSlug}
            dashboardId={dashboardId}
            name={dashboard.name}
          />
        ) : (
          <span className="h-4 w-36 animate-pulse rounded-sm bg-muted" />
        )}
      </div>
    </Layout.Header>
  );

  if (isLoading) {
    return (
      <Layout>
        {header}
        <Layout.Toolbar>
          <span className="h-4 w-56 animate-pulse rounded-sm bg-muted" />
        </Layout.Toolbar>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {["a", "b", "c", "d"].map((id) => (
              <div
                key={id}
                className="h-40 animate-pulse rounded-lg border bg-muted/40"
                style={{ gridColumn: "span 12" }}
              />
            ))}
          </div>
        </div>
      </Layout>
    );
  }
  if (isError || !dashboard) {
    return (
      <Layout>
        {header}
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <AlertCircle className="mx-auto mb-3 size-4 text-destructive-foreground" />
            <h1 className="text-sm font-semibold">
              {t("navigation:dashboards.loadPanelError")}
            </h1>
            <p className="mt-1 mb-4 text-ui text-muted-foreground">
              {t("navigation:dashboards.loadError")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("navigation:dashboards.retry")}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {header}
      <Layout.Toolbar>
        {/* Dashboard-scoped range/global filters are placeholders until the
          query engine grows them. */}
        <span className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
          {t("navigation:dashboards.range", { defaultValue: "Range" })} ·{" "}
          {t("navigation:dashboards.soon", { defaultValue: "Soon" })}
        </span>
        <span className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
          {t("navigation:dashboards.filters")} ·{" "}
          {t("navigation:dashboards.soon", { defaultValue: "Soon" })}
        </span>
        <span className="flex-1" />
        {canEdit ? (
          <>
            <Button size="sm" onClick={() => setEditorState({ mode: "new" })}>
              <Plus /> {t("navigation:dashboards.addPanel")}
            </Button>
            <Button
              variant="outline"
              size="sm"
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
                    size="icon-sm"
                    aria-label={t("navigation:dashboards.delete")}
                    className="data-popup-open:bg-secondary"
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive-foreground data-highlighted:text-destructive-foreground"
                  onClick={() => setDashboardDeleteOpen(true)}
                >
                  <Trash2 /> {t("navigation:dashboards.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </Layout.Toolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {panels.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <div>
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
                <ChartPie className="size-6" />
              </div>
              <h2 className="text-sm font-semibold">
                {t("navigation:dashboards.noData")}
              </h2>
              {!canEdit ? (
                <p className="mt-1 max-w-sm text-ui text-muted-foreground">
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
    </Layout>
  );
}
