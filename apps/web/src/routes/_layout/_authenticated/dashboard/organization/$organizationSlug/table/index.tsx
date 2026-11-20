import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Plus, Table2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureTablesStrings } from "@/lib/i18n";

// Pull the lazy tables/dashboards strings as early as possible.
void ensureTablesStrings();

import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import PermissionDenied from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

// Modal stays out of the entry chunk (same split as the sidebar).
const CreateDataTableModal = lazy(
  () => import("@/components/shared/modals/create-data-table-modal"),
);

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/table/",
)({
  component: TablesIndexRoute,
});

function TablesIndexRoute() {
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
  const canCreate = useOrganizationPermission().canCreateBoards();
  const {
    data: tables = [],
    isLoading,
    isError,
    refetch,
  } = useDataTables(organizationId, tablesEnabled);
  const [createOpen, setCreateOpen] = useState(false);

  if (!activeOrganization) return null;
  if (!tablesEnabled) return <PermissionDenied />;

  return (
    <OrganizationLayout
      title={t("navigation:tables.title")}
      headerActions={
        canCreate ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> {t("navigation:tables.create")}
          </Button>
        ) : null
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <PageTitle title={t("navigation:tables.title")} hideAppName />
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
                {t("navigation:tables.loadError")}
              </h2>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => refetch()}
              >
                {t("navigation:tables.retry")}
              </Button>
            </div>
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <div>
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Table2 className="size-4" />
              </div>
              <h2 className="font-semibold">{t("navigation:tables.empty")}</h2>
              {!canCreate ? (
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {t("navigation:tables.readOnlyEmpty")}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <button
                className="group rounded-lg border bg-card p-3 text-left hover:bg-accent"
                data-testid="tables-index-row"
                key={table.id}
                onClick={() =>
                  navigate({
                    to: "/dashboard/organization/$organizationSlug/table/$tableId",
                    params: {
                      organizationSlug,
                      tableId: table.slug ?? table.id,
                    },
                  })
                }
                type="button"
              >
                <span className="block truncate font-medium">{table.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        <CreateDataTableModal
          onClose={() => setCreateOpen(false)}
          open={createOpen}
          organizationId={organizationId}
          organizationSlug={organizationSlug}
        />
      </Suspense>
    </OrganizationLayout>
  );
}
