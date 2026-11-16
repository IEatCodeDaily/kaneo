import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

/** Dashboards chart table data, so they need both organization flags. */
export function useDashboardsEnabled() {
  const { data: organization } = useActiveOrganization();
  const flags = organization as
    | { tablesEnabled?: boolean; dashboardsEnabled?: boolean }
    | undefined;
  return Boolean(flags?.tablesEnabled && flags?.dashboardsEnabled);
}
