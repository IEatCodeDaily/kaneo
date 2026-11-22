import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ChartPie } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeatureStageBadge } from "@/components/feature-stage-badge";
import { ResourceSection } from "@/components/sidebar/resource-section";
import {
  useDashboardDetails,
  useDashboards,
} from "@/hooks/dashboards/use-dashboards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useDashboardsEnabled } from "@/hooks/use-dashboards-enabled";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { SIDEBAR_ROUTES, useSidebarActive } from "@/hooks/use-sidebar-active";
import { ensureTablesStrings } from "@/lib/i18n";
import type { DashboardSummary } from "@/types/dashboards";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

// Modal + its dashboard-hook graph stay out of the entry chunk.
const CreateDashboardModal = lazy(
  () => import("@/components/dashboard/create-dashboard-modal"),
);

export function NavDashboards() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { isActive } = useSidebarActive();
  const navigate = useNavigate();
  const { canCreateBoards } = useOrganizationPermission();
  const [createOpen, setCreateOpen] = useState(false);
  const dashboardsEnabled = useDashboardsEnabled();
  const {
    data: dashboards = [],
    isLoading,
    isError,
    refetch,
  } = useDashboards(organization?.id ?? "", dashboardsEnabled);
  const details = useDashboardDetails(
    organization?.id ?? "",
    dashboards.map((dashboard) => dashboard.id),
    dashboardsEnabled,
  );

  if (!organization || !dashboardsEnabled) return null;

  const orgParams = { organizationSlug: organization.slug };
  const isCurrentDashboard = (
    dashboard: Pick<DashboardSummary, "id" | "slug">,
  ) =>
    isActive(SIDEBAR_ROUTES.dashboard, {
      ...orgParams,
      dashboardId: dashboard.slug ?? dashboard.id,
    }) ||
    isActive(SIDEBAR_ROUTES.dashboard, {
      ...orgParams,
      dashboardId: dashboard.id,
    });
  // Section fallback: on a dashboard route whose dashboard is not in the
  // visible list (still loading, error, or hidden), the header lights up.
  const dashboardsSectionActive =
    isActive(SIDEBAR_ROUTES.dashboards, orgParams) &&
    !dashboards.some((dashboard) => isCurrentDashboard(dashboard));

  return (
    <>
      <ResourceSection
        id="dashboards"
        label={t("navigation:dashboards.title")}
        headerBadge={<FeatureStageBadge stage="Alpha" />}
        sectionActive={dashboardsSectionActive}
        onHeaderClick={() =>
          navigate({
            to: "/dashboard/organization/$organizationSlug/dashboards",
            params: { organizationSlug: organization.slug },
          })
        }
        addAction={
          canCreateBoards()
            ? {
                label: t("navigation:dashboards.create"),
                onClick: () => setCreateOpen(true),
              }
            : undefined
        }
        loadingState={
          isLoading && (
            <div
              className="space-y-1 px-2 py-1"
              aria-label={t("navigation:dashboards.loading")}
              role="status"
            >
              <div className="h-7 animate-pulse rounded-md bg-sidebar-accent/60" />
              <div className="h-7 w-4/5 animate-pulse rounded-md bg-sidebar-accent/40" />
            </div>
          )
        }
        errorState={
          isError && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-destructive hover:bg-sidebar-accent"
              onClick={() => refetch()}
            >
              <AlertCircle className="size-3.5" />
              {t("navigation:dashboards.loadError")}{" "}
              {t("navigation:dashboards.retry")}
            </button>
          )
        }
        items={dashboards.map((dashboard) => {
          const detail = details.find(
            (query) => query.data?.id === dashboard.id,
          )?.data;
          return {
            id: dashboard.id,
            label: dashboard.name,
            icon: <ChartPie className="size-4 text-sidebar-foreground/70" />,
            active: isCurrentDashboard(dashboard),
            tooltip: dashboard.name,
            trailing: (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {t("navigation:dashboards.panelsCount", {
                  count: detail?.panels.length ?? 0,
                })}
              </span>
            ),
            onSelect: () =>
              navigate({
                to: "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
                params: {
                  organizationSlug: organization.slug,
                  dashboardId: dashboard.slug ?? dashboard.id,
                },
              }),
          };
        })}
      />
      <Suspense fallback={null}>
        <CreateDashboardModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organization.id}
          organizationSlug={organization.slug}
        />
      </Suspense>
    </>
  );
}
