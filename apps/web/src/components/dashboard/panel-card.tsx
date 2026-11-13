import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardPanelData,
  useDashboardTableFields,
} from "@/hooks/dashboards/use-dashboards";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import type { DashboardPanelSpec } from "@/types/dashboards";
import { queryChipText } from "./panel-data";
import {
  AreaPanel,
  BarPanel,
  LinePanel,
  PiePanel,
  type RendererProps,
  resolveRows,
  StatPanel,
  TablePanel,
} from "./renderers";

type PanelCardProps = {
  spec: DashboardPanelSpec;
  organizationId: string;
  canEdit: boolean;
  onEdit: (spec: DashboardPanelSpec) => void;
  onDelete: (spec: DashboardPanelSpec) => void;
};

const RENDERERS: Record<
  DashboardPanelSpec["type"],
  (props: RendererProps) => React.JSX.Element
> = {
  stat: StatPanel,
  bar: BarPanel,
  line: LinePanel,
  area: AreaPanel,
  pie: PiePanel,
  table: TablePanel,
};

export function PanelCard({
  spec,
  organizationId,
  canEdit,
  onEdit,
  onDelete,
}: PanelCardProps) {
  const { t } = useTranslation();
  // Fields come from the panel's own source table (panels may differ).
  const { data: fields = [] } = useDashboardTableFields(
    organizationId,
    spec.query.tableId,
  );
  const { data, isLoading, isError, refetch } = useDashboardPanelData(
    organizationId,
    spec.query,
  );
  const { data: membersResult } =
    useGetActiveOrganizationMembers(organizationId);
  // better-auth's listMembers types as {members, total} | []; normalize once.
  const memberRows = Array.isArray(membersResult)
    ? membersResult
    : (membersResult?.members ?? []);
  const memberNames = new Map<string, string>(
    memberRows.map((member) => [
      member.userId,
      member.user?.name ?? member.user?.email ?? member.userId,
    ]),
  );
  const rows = data?.rows ?? [];
  const resolvedRows = resolveRows(spec, rows, fields, memberNames);
  const Renderer = RENDERERS[spec.type];

  return (
    <div className="group flex h-full min-w-0 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-sm font-semibold">
          {spec.title}
        </b>
        {canEdit ? (
          // Edit/more on hover (design: panels stay quiet until pointed at).
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("navigation:dashboards.editPanel")}
              onClick={() => onEdit(spec)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("navigation:dashboards.deletePanel")}
              className="text-destructive-foreground"
              onClick={() => onDelete(spec)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </span>
        ) : null}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {queryChipText(spec, fields, t("navigation:dashboards.groupByPrefix"))}
      </p>
      <div className="min-h-24 flex-1">
        {isLoading ? (
          <div
            className="space-y-2"
            role="status"
            aria-label={t("navigation:dashboards.loading")}
          >
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div className="flex h-full items-center gap-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">
              {t("navigation:dashboards.loadPanelError")}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => refetch()}
              aria-label={t("navigation:dashboards.retry")}
            >
              <RefreshCw /> {t("navigation:dashboards.retry")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="flex h-full items-center text-sm text-muted-foreground">
            {t("navigation:dashboards.noData")}
          </p>
        ) : (
          <Renderer
            spec={spec}
            rows={resolvedRows}
            fields={fields}
            memberNames={memberNames}
          />
        )}
      </div>
    </div>
  );
}
