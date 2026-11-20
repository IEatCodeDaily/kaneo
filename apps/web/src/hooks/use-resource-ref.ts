/**
 * Resolve repo/table/dashboard route params (#resource-slugs).
 *
 * The URL param carries a slug; legacy createId() ids still resolve by
 * matching the list. The resolved `id` is what every fetcher receives, so the
 * API surface stays id-addressed; `ref` is the raw param for links that must
 * keep the current URL shape. Until the org's list query lands, a slug param
 * yields "" (pages gate on it exactly like useBoardSlug does), while a cuid
 * param passes straight through — old links never wait on the list.
 */
import { useParams } from "@tanstack/react-router";
import { useDashboards } from "@/hooks/dashboards/use-dashboards";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { useDashboardsEnabled } from "@/hooks/use-dashboards-enabled";
import { looksLikeCuid, matchResourceRef } from "@/lib/resource-ref";

function useOrganization() {
  const { data: organization } = useActiveOrganization();
  return { organization, organizationId: organization?.id ?? "" };
}

export function useRepoRefParam() {
  const { repoId: ref } = useParams({ strict: false });
  const { organization, organizationId } = useOrganization();
  const { data: repos } = useGetRepos({ organizationId });
  const repo = matchResourceRef(
    repos,
    ref,
    (r) => r.id,
    (r) => r.slug,
  );
  return {
    ref: ref ?? "",
    id: repo?.id ?? (looksLikeCuid(ref) ? (ref ?? "") : ""),
    repo,
    organization,
    organizationId,
  };
}

export function useTableRefParam() {
  const { tableId: ref } = useParams({ strict: false });
  const { organization, organizationId } = useOrganization();
  const tablesEnabled = Boolean(
    (
      organization as
        | (typeof organization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const { data: tables } = useDataTables(organizationId, tablesEnabled);
  const table = matchResourceRef(
    tables,
    ref,
    (t) => t.id,
    (t) => t.slug,
  );
  return {
    ref: ref ?? "",
    id: table?.id ?? (looksLikeCuid(ref) ? (ref ?? "") : ""),
    table,
    organization,
    organizationId,
  };
}

export function useDashboardRefParam() {
  const { dashboardId: ref } = useParams({ strict: false });
  const { organization, organizationId } = useOrganization();
  const dashboardsEnabled = useDashboardsEnabled();
  const { data: dashboards } = useDashboards(organizationId, dashboardsEnabled);
  const dashboard = matchResourceRef(
    dashboards,
    ref,
    (d) => d.id,
    (d) => d.slug,
  );
  return {
    ref: ref ?? "",
    id: dashboard?.id ?? (looksLikeCuid(ref) ? (ref ?? "") : ""),
    dashboard,
    organization,
    organizationId,
  };
}
