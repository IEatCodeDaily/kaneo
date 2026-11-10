import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createDashboard,
  deleteDashboard,
  getDashboard,
  getDashboards,
  runDashboardQuery,
  updateDashboard,
} from "@/fetchers/dashboard/dashboard";
import { getDataTable } from "@/fetchers/data-table/data-table";
import type { DashboardTarget, QuerySpec } from "@/types/dashboards";

export const dashboardKeys = {
  all: ["dashboards"] as const,
  list: (organizationId: string) => ["dashboards", organizationId] as const,
  detail: (organizationId: string, dashboardId: string) =>
    ["dashboard", organizationId, dashboardId] as const,
};

const panelDataKey = (organizationId: string, query: QuerySpec) =>
  [...dashboardKeys.all, "query", organizationId, query] as const;

export function useDashboards(organizationId: string, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.list(organizationId),
    queryFn: () => getDashboards(organizationId),
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useDashboard(
  organizationId: string,
  dashboardId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: dashboardKeys.detail(organizationId, dashboardId),
    queryFn: () => getDashboard({ organizationId, dashboardId }),
    enabled: Boolean(organizationId && dashboardId) && enabled,
  });
}

// Summaries carry no panel count, so the sidebar/index read each detail once;
// they share the detail cache with the dashboard page.
export function useDashboardDetails(
  organizationId: string,
  dashboardIds: string[],
  enabled = true,
) {
  return useQueries({
    queries: dashboardIds.map((dashboardId) => ({
      queryKey: dashboardKeys.detail(organizationId, dashboardId),
      queryFn: () => getDashboard({ organizationId, dashboardId }),
      enabled: Boolean(organizationId && dashboardId) && enabled,
    })),
  });
}

// Field metadata for a panel's source table. The tables track owns the
// canonical types; dashboards only read the structural field view.
export function useDashboardTableFields(
  organizationId: string,
  tableId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [...dashboardKeys.all, "fields", organizationId, tableId],
    queryFn: async () => {
      const table = await getDataTable(tableId, organizationId);
      return table.fields;
    },
    enabled: Boolean(organizationId && tableId) && enabled,
  });
}

// One query per panel; the spec itself is the cache key so editing any part
// of it refetches.
export function useDashboardPanelData(
  organizationId: string,
  query: QuerySpec,
  enabled = true,
) {
  return useQuery({
    queryKey: panelDataKey(organizationId, query),
    queryFn: () => runDashboardQuery({ organizationId, query }),
    enabled: Boolean(organizationId && query.tableId) && enabled,
  });
}

export function useDashboardMutations(
  organizationId: string,
  // Kept for call-site compatibility; detail invalidation rides the mutation
  // variables, so the id itself is unused here.
  _dashboardId?: string,
) {
  const queryClient = useQueryClient();
  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.list(organizationId),
    });

  return {
    createDashboard: useMutation({
      mutationFn: createDashboard,
      onSuccess: refreshList,
    }),
    updateDashboard: useMutation({
      mutationFn: updateDashboard,
      onSuccess: async (_data, variables) => {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.detail(organizationId, variables.dashboardId),
        });
        await refreshList();
      },
    }),
    deleteDashboard: useMutation({
      mutationFn: (target: DashboardTarget) => deleteDashboard(target),
      onSuccess: async (_data: unknown, target: DashboardTarget) => {
        await queryClient.invalidateQueries({
          queryKey: dashboardKeys.detail(organizationId, target.dashboardId),
        });
        await refreshList();
      },
    }),
  };
}
