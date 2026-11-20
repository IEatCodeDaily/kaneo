import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ChartPie, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeatureStageBadge } from "@/components/feature-stage-badge";
import {
  useDashboardDetails,
  useDashboards,
} from "@/hooks/dashboards/use-dashboards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useDashboardsEnabled } from "@/hooks/use-dashboards-enabled";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import {
  SIDEBAR_ACTIVE_PILL,
  SIDEBAR_ROUTES,
  SIDEBAR_SECTION_HEADER,
  useSidebarActive,
} from "@/hooks/use-sidebar-active";
import { ensureTablesStrings } from "@/lib/i18n";
import type { DashboardSummary } from "@/types/dashboards";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

// Modal + its dashboard-hook graph stay out of the entry chunk.
const CreateDashboardModal = lazy(
  () => import("@/components/dashboard/create-dashboard-modal"),
);

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

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
      <SidebarGroup className="group/dashboards gap-1 p-2 pt-1 group-data-[collapsible=icon]:hidden">
        <div className="relative flex items-center">
          <SidebarGroupLabel
            className={`h-7 min-w-0 flex-1 cursor-pointer gap-2 px-0 ${SIDEBAR_SECTION_HEADER}`}
            data-active={dashboardsSectionActive}
            render={<button type="button" />}
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationSlug/dashboards",
                params: { organizationSlug: organization.slug },
              })
            }
          >
            <span>{t("navigation:dashboards.title")}</span>
            <FeatureStageBadge stage="Alpha" />
          </SidebarGroupLabel>
          {canCreateBoards() && (
            <button
              type="button"
              aria-label={t("navigation:dashboards.create")}
              className="absolute right-0 flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/dashboards:opacity-100 group-hover/dashboards:opacity-100"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {isLoading && (
              <div
                className="space-y-1 px-2 py-1"
                aria-label={t("navigation:dashboards.loading")}
                role="status"
              >
                <div className="h-7 animate-pulse rounded-md bg-sidebar-accent/60" />
                <div className="h-7 w-4/5 animate-pulse rounded-md bg-sidebar-accent/40" />
              </div>
            )}
            {isError && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-destructive hover:bg-sidebar-accent"
                onClick={() => refetch()}
              >
                <AlertCircle className="size-3.5" />
                {t("navigation:dashboards.loadError")}{" "}
                {t("navigation:dashboards.retry")}
              </button>
            )}
            {dashboards.map((dashboard) => {
              const detail = details.find(
                (query) => query.data?.id === dashboard.id,
              )?.data;
              return (
                <SidebarMenuItem key={dashboard.id}>
                  <SidebarMenuButton
                    isActive={isCurrentDashboard(dashboard)}
                    className={`h-8 gap-2 ps-3.5 text-sm ${SIDEBAR_ACTIVE_PILL}`}
                    tooltip={dashboard.name}
                    onClick={() =>
                      navigate({
                        to: "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
                        params: {
                          organizationSlug: organization.slug,
                          dashboardId: dashboard.slug ?? dashboard.id,
                        },
                      })
                    }
                  >
                    <ChartPie className="size-4 text-sidebar-foreground/70" />
                    <span className="min-w-0 flex-1 truncate">
                      {dashboard.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t("navigation:dashboards.panelsCount", {
                        count: detail?.panels.length ?? 0,
                      })}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
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
