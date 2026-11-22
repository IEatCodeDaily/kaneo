import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, EyeOff, Table2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { FeatureStageBadge } from "@/components/feature-stage-badge";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { ResourceSection } from "@/components/sidebar/resource-section";
import { reconcileSidebarOrder } from "@/components/sidebar-sort";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { SIDEBAR_ROUTES, useSidebarActive } from "@/hooks/use-sidebar-active";
import { ensureTablesStrings } from "@/lib/i18n";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { DataTableSummary } from "@/types/data-table";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

const CreateDataTableModal = lazy(
  () => import("./shared/modals/create-data-table-modal"),
);

export function NavTables() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();
  const { isActive } = useSidebarActive();
  const navigate = useNavigate();
  const { canCreateBoards } = useOrganizationPermission();
  const [createOpen, setCreateOpen] = useState(false);
  const tablesEnabled = Boolean(
    (
      organization as
        | (typeof organization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const {
    data: tables = [],
    isLoading,
    isError,
    refetch,
  } = useDataTables(organization?.id ?? "", tablesEnabled);
  const userId = user?.id ?? "";
  const hiddenTableIds = useUserPreferencesStore(
    (state) => state.hiddenTableIds,
  );
  const setTableSidebarVisibility = useUserPreferencesStore(
    (state) => state.setTableSidebarVisibility,
  );
  const tableSidebarOrders = useUserPreferencesStore(
    (state) => state.tableSidebarOrders,
  );
  const setTableSidebarOrder = useUserPreferencesStore(
    (state) => state.setTableSidebarOrder,
  );

  if (!organization || !tablesEnabled) return null;

  const hiddenKey = (tableId: string) => `${userId}:${tableId}`;
  const visibleTables = reconcileSidebarOrder(
    tables.filter((table) => !hiddenTableIds.includes(hiddenKey(table.id))),
    tableSidebarOrders[userId] ?? [],
  );
  const hiddenTables = tables.filter((table) =>
    hiddenTableIds.includes(hiddenKey(table.id)),
  );

  const orgParams = { organizationSlug: organization.slug };
  const isCurrentTable = (table: Pick<DataTableSummary, "id" | "slug">) =>
    isActive(SIDEBAR_ROUTES.table, {
      ...orgParams,
      tableId: table.slug ?? table.id,
    }) || isActive(SIDEBAR_ROUTES.table, { ...orgParams, tableId: table.id });
  // Section fallback: on a table route whose table is not in the visible
  // list (still loading, error, or hidden), the header lights up.
  const tablesSectionActive =
    isActive(SIDEBAR_ROUTES.tables, orgParams) &&
    !visibleTables.some((table) => isCurrentTable(table));

  const openTable = (table: Pick<DataTableSummary, "id" | "slug">) =>
    navigate({
      to: "/dashboard/organization/$organizationSlug/table/$tableId",
      params: {
        organizationSlug: organization.slug,
        tableId: table.slug ?? table.id,
      },
    });

  return (
    <>
      <ResourceSection
        id="tables"
        label={t("navigation:tables.title")}
        headerBadge={<FeatureStageBadge stage="Alpha" />}
        sectionActive={tablesSectionActive}
        onHeaderClick={() =>
          navigate({
            to: "/dashboard/organization/$organizationSlug/table",
            params: { organizationSlug: organization.slug },
          })
        }
        addAction={
          canCreateBoards()
            ? {
                label: t("navigation:tables.create"),
                onClick: () => setCreateOpen(true),
              }
            : undefined
        }
        loadingState={
          isLoading && (
            <div
              className="space-y-1 px-2 py-1"
              aria-label={t("navigation:tables.loading")}
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
              {t("navigation:tables.loadError")} {t("navigation:tables.retry")}
            </button>
          )
        }
        emptyState={
          !isLoading &&
          !isError &&
          tables.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("navigation:tables.noTables")}
            </p>
          )
        }
        sortable={{
          ids: visibleTables.map((table) => table.id),
          onReorder: (ids) => setTableSidebarOrder(userId, ids),
        }}
        items={visibleTables.map((table) => ({
          id: table.id,
          label: table.name,
          icon: <Table2 className="size-4 text-sidebar-foreground/70" />,
          active: isCurrentTable(table),
          tooltip: table.name,
          muted: Boolean(table.deletedAt),
          onSelect: () => openTable(table),
        }))}
        actions={(item) => [
          {
            label: t("navigation:sidebar.hideFromSidebar"),
            icon: EyeOff,
            onSelect: () => setTableSidebarVisibility(userId, item.id, false),
          },
        ]}
        actionTriggerLabel={t("navigation:sidebar.more")}
        hiddenItems={hiddenTables.map((table) => ({
          id: table.id,
          name: table.name,
        }))}
        hiddenMenuLabel={t("navigation:sidebar.more")}
        hiddenShowLabel={(name) => t("navigation:sidebar.showItem", { name })}
        onShowHidden={(tableId) =>
          setTableSidebarVisibility(userId, tableId, true)
        }
        moreHiddenLabel={t("navigation:sidebar.moreTables")}
        onHiddenSelect={(tableId) => {
          const table = tables.find((entry) => entry.id === tableId);
          if (table) openTable(table);
        }}
        isHiddenActive={(tableId) => {
          const table = tables.find((entry) => entry.id === tableId);
          return table ? isCurrentTable(table) : false;
        }}
      />
      <Suspense fallback={null}>
        <CreateDataTableModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organization.id}
          organizationSlug={organization.slug}
        />
      </Suspense>
    </>
  );
}
