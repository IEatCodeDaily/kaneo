import i18n from "i18next";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardTableFields } from "@/hooks/dashboards/use-dashboards";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import type {
  DashboardAgg,
  DashboardDateBucket,
  DashboardFieldView,
  DashboardFilter,
  DashboardFilterOp,
  DashboardPanelSpan,
  DashboardPanelSpec,
  DashboardPanelType,
  QuerySpec,
} from "@/types/dashboards";
import { DASHBOARD_PANEL_SPANS } from "@/types/dashboards";
import {
  fieldChoices,
  findField,
  GROUPABLE_FIELD_TYPES,
  NUMERIC_FIELD_TYPES,
  queryChipText,
} from "./panel-data";

const AGGS: Array<{ value: DashboardAgg; labelKey: string }> = [
  { value: "count", labelKey: "aggCount" },
  { value: "sum", labelKey: "aggSum" },
  { value: "avg", labelKey: "aggAvg" },
  { value: "min", labelKey: "aggMin" },
  { value: "max", labelKey: "aggMax" },
];

const PANEL_TYPES: Array<{ value: DashboardPanelType; labelKey: string }> = [
  { value: "stat", labelKey: "typeStat" },
  { value: "bar", labelKey: "typeBar" },
  { value: "line", labelKey: "typeLine" },
  { value: "area", labelKey: "typeArea" },
  { value: "pie", labelKey: "typePie" },
  { value: "table", labelKey: "typeTable" },
];

const BUCKETS: Array<{ value: DashboardDateBucket; labelKey: string }> = [
  { value: "day", labelKey: "bucketDay" },
  { value: "week", labelKey: "bucketWeek" },
  { value: "month", labelKey: "bucketMonth" },
];

const OPS_BY_TYPE: Record<string, DashboardFilterOp[]> = {
  checkbox: ["eq", "isEmpty"],
};
const DATE_AND_NUMERIC_OPS: DashboardFilterOp[] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "isEmpty",
];
const DEFAULT_OPS: DashboardFilterOp[] = ["eq", "neq", "in", "isEmpty"];

type FilterState = {
  id: string;
  fieldId: string;
  op: DashboardFilterOp;
  value: string;
};

type PanelEditorDialogProps = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  panel?: DashboardPanelSpec;
  onCommit: (panel: DashboardPanelSpec) => void;
};

function opsForField(field: DashboardFieldView | undefined) {
  if (!field) return DEFAULT_OPS;
  if (field.type === "checkbox") return OPS_BY_TYPE.checkbox;
  if (
    NUMERIC_FIELD_TYPES.includes(field.type) ||
    field.type === "date" ||
    field.type === "datetime"
  ) {
    return DATE_AND_NUMERIC_OPS;
  }
  return DEFAULT_OPS;
}

function opLabelKey(op: DashboardFilterOp) {
  return {
    eq: "opEq",
    neq: "opNeq",
    in: "opIn",
    lt: "opLt",
    lte: "opLte",
    gt: "opGt",
    gte: "opGte",
    isEmpty: "opIsEmpty",
  }[op];
}

// i18n keys missing from the dashboards namespace (width/yes/no) fall back to
const widthLabel = () => i18n.t("navigation:dashboards.span");
const yesNoLabel = (value: boolean) =>
  i18n.t(`navigation:dashboards.${value ? "yes" : "no"}`);
const noChoicesText = () => i18n.t("navigation:dashboards.noChoices");

export default function PanelEditorDialog({
  open,
  onClose,
  organizationId,
  panel,
  onCommit,
}: PanelEditorDialogProps) {
  const { t } = useTranslation();
  const { data: tables = [] } = useDataTables(organizationId, open);
  const [tableId, setTableId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DashboardPanelType>("stat");
  const [span, setSpan] = useState<DashboardPanelSpan>(8);
  const [agg, setAgg] = useState<DashboardAgg>("count");
  const [metricFieldId, setMetricFieldId] = useState("");
  const [groupByFieldId, setGroupByFieldId] = useState("none");
  const [bucket, setBucket] = useState<DashboardDateBucket>("day");
  const [filters, setFilters] = useState<FilterState[]>([]);

  const { data: fields = [] } = useDashboardTableFields(
    organizationId,
    tableId,
    open && Boolean(tableId),
  );
  const { data: membersResult = [] } =
    useGetActiveOrganizationMembers(organizationId);
  // better-auth's listMembers types as {members, total} | []; normalize once.
  const members = Array.isArray(membersResult)
    ? membersResult
    : (membersResult?.members ?? []);

  useEffect(() => {
    if (!open) return;
    const query = panel?.query;
    setTableId(query?.tableId ?? "");
    setTitle(panel?.title ?? "");
    setType(panel?.type ?? "stat");
    setSpan(panel?.span ?? 8);
    setAgg(query?.metric.agg ?? "count");
    setMetricFieldId(query?.metric.fieldId ?? "");
    setGroupByFieldId(query?.groupBy?.fieldId ?? "none");
    setBucket(query?.groupBy?.bucket ?? "day");
    setFilters(
      (query?.filters ?? []).map((filter) => ({
        id: crypto.randomUUID(),
        fieldId: filter.fieldId,
        op: filter.op,
        value: Array.isArray(filter.value)
          ? filter.value.join(",")
          : filter.value === undefined || filter.value === null
            ? ""
            : String(filter.value),
      })),
    );
  }, [open, panel]);

  const numericFields = fields.filter((field) =>
    NUMERIC_FIELD_TYPES.includes(field.type),
  );
  const groupableFields = fields.filter((field) =>
    GROUPABLE_FIELD_TYPES.includes(field.type),
  );
  const groupField = findField(fields, groupByFieldId);
  const needsBucket =
    groupField?.type === "date" || groupField?.type === "datetime";
  const metricValid = agg === "count" || Boolean(metricFieldId);
  const valid = Boolean(tableId) && metricValid;

  const selectTable = (next: string) => {
    // Field ids belong to the old table — clear everything derived from them.
    setTableId(next);
    setMetricFieldId("");
    setGroupByFieldId("none");
    setFilters([]);
  };

  const updateFilter = (index: number, patch: Partial<FilterState>) => {
    setFilters(
      filters.map((filter, i) =>
        i === index ? { ...filter, ...patch } : filter,
      ),
    );
  };

  const buildQuery = (): QuerySpec => {
    const builtFilters = filters.flatMap((filter): DashboardFilter[] => {
      if (!filter.fieldId) return [];
      if (filter.op === "isEmpty") {
        return [{ fieldId: filter.fieldId, op: filter.op }];
      }
      const field = findField(fields, filter.fieldId);
      let value: unknown = filter.value;
      if (field && NUMERIC_FIELD_TYPES.includes(field.type)) {
        value = Number(filter.value);
        if (Number.isNaN(value)) return [];
      } else if (field?.type === "checkbox") {
        value = filter.value === "true";
      } else if (filter.op === "in") {
        value = filter.value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      }
      return [{ fieldId: filter.fieldId, op: filter.op, value }];
    });
    return {
      tableId,
      metric:
        agg === "count"
          ? { agg: "count" as const }
          : { agg, fieldId: metricFieldId },
      ...(groupByFieldId !== "none"
        ? {
            groupBy: {
              fieldId: groupByFieldId,
              ...(needsBucket ? { bucket } : {}),
            },
          }
        : {}),
      ...(builtFilters.length > 0 ? { filters: builtFilters } : {}),
    };
  };

  const submit = () => {
    if (!valid) return;
    onCommit({
      id: panel?.id ?? crypto.randomUUID(),
      title: title.trim() || t("navigation:dashboards.panelTitle"),
      type,
      span,
      query: buildQuery(),
    });
    onClose();
  };

  const chipText = tableId
    ? queryChipText(
        { id: "preview", title: "", type, span, query: buildQuery() },
        fields,
        t("navigation:dashboards.groupByPrefix"),
      )
    : "";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {panel
              ? t("navigation:dashboards.editPanel")
              : t("navigation:dashboards.addPanel")}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pe-1">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("navigation:dashboards.panelTitle")}
            aria-label={t("navigation:dashboards.panelTitle")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={tableId}
              onValueChange={(value) => selectTable(value ?? "")}
            >
              <SelectTrigger aria-label={t("navigation:dashboards.source")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tables
                  .filter((table) => table.deletedAt === null)
                  .map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {table.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={type}
              onValueChange={(value) => setType(value as DashboardPanelType)}
            >
              <SelectTrigger aria-label={t("navigation:dashboards.panelType")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PANEL_TYPES.map(({ value, labelKey }) => (
                  <SelectItem key={value} value={value}>
                    {t(`navigation:dashboards.${labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={agg}
              onValueChange={(value) => setAgg(value as DashboardAgg)}
            >
              <SelectTrigger aria-label={t("navigation:dashboards.metric")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGGS.map(({ value, labelKey }) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={value !== "count" && numericFields.length === 0}
                  >
                    {t(`navigation:dashboards.${labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={metricFieldId}
              onValueChange={(value) => setMetricFieldId(value ?? "")}
              disabled={agg === "count"}
            >
              <SelectTrigger
                aria-label={t("navigation:dashboards.metricField")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numericFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              value={groupByFieldId}
              onValueChange={(value) => setGroupByFieldId(value ?? "none")}
            >
              <SelectTrigger aria-label={t("navigation:dashboards.groupBy")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("navigation:dashboards.groupByNone")}
                </SelectItem>
                {groupableFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsBucket ? (
              <Select
                value={bucket}
                onValueChange={(value) =>
                  setBucket(value as DashboardDateBucket)
                }
              >
                <SelectTrigger
                  aria-label={t("navigation:dashboards.dateBucket")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUCKETS.map(({ value, labelKey }) => (
                    <SelectItem key={value} value={value}>
                      {t(`navigation:dashboards.${labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("navigation:dashboards.filters")}
            </p>
            {filters.map((filter, index) => {
              const field = findField(fields, filter.fieldId);
              return (
                <div key={filter.id} className="flex items-center gap-2">
                  <Select
                    value={filter.fieldId}
                    onValueChange={(value) => {
                      updateFilter(index, {
                        fieldId: value ?? "",
                        op: opsForField(findField(fields, value ?? ""))[0],
                        value: "",
                      });
                    }}
                  >
                    <SelectTrigger
                      aria-label={t("navigation:dashboards.metricField")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filter.op}
                    onValueChange={(value) =>
                      updateFilter(index, { op: value as DashboardFilterOp })
                    }
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {opsForField(field).map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(`navigation:dashboards.${opLabelKey(op)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FilterValueInput
                    field={field}
                    op={filter.op}
                    value={filter.value}
                    members={members}
                    onChange={(value) => updateFilter(index, { value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("navigation:dashboards.removeFilter")}
                    onClick={() =>
                      setFilters(filters.filter((_, i) => i !== index))
                    }
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFilters([
                  ...filters,
                  {
                    id: crypto.randomUUID(),
                    fieldId: "",
                    op: "eq",
                    value: "",
                  },
                ])
              }
            >
              <Plus /> {t("navigation:dashboards.addFilter")}
            </Button>
          </div>
          <Select
            value={String(span)}
            onValueChange={(value) =>
              setSpan(Number(value) as DashboardPanelSpan)
            }
          >
            <SelectTrigger aria-label={widthLabel()} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_PANEL_SPANS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {Math.round((value / 24) * 100)}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chipText ? (
            <p className="truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              {chipText}
            </p>
          ) : null}
          {!valid ? (
            <p className="text-xs text-destructive">
              {t("navigation:dashboards.invalidSpec")}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("navigation:dashboards.cancel")}
          </Button>
          <Button disabled={!valid} onClick={submit}>
            {t("navigation:dashboards.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterValueInput({
  field,
  op,
  value,
  members,
  onChange,
}: {
  field: DashboardFieldView | undefined;
  op: DashboardFilterOp;
  value: string;
  members: Array<{
    userId: string;
    user?: { name?: string | null; email?: string | null } | null;
  }>;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  if (op === "isEmpty") return null;
  if (field?.type === "select") {
    const choices = fieldChoices(field);
    if (choices.length === 0) {
      return (
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          {noChoicesText()}
        </span>
      );
    }
    return (
      <Select value={value} onValueChange={(value) => onChange(value ?? "")}>
        <SelectTrigger aria-label={t("navigation:dashboards.value")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field?.type === "user") {
    return (
      <Select value={value} onValueChange={(value) => onChange(value ?? "")}>
        <SelectTrigger aria-label={t("navigation:dashboards.value")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member.user?.name ?? member.user?.email ?? member.userId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field?.type === "checkbox") {
    return (
      <Select value={value} onValueChange={(value) => onChange(value ?? "")}>
        <SelectTrigger aria-label={t("navigation:dashboards.value")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["true", "false"].map((entry) => (
            <SelectItem key={entry} value={entry}>
              {yesNoLabel(entry === "true")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field && NUMERIC_FIELD_TYPES.includes(field.type)) {
    return (
      <Input
        aria-label={t("navigation:dashboards.value")}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field?.type === "date" || field?.type === "datetime") {
    return (
      <Input
        aria-label={t("navigation:dashboards.value")}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      aria-label={t("navigation:dashboards.value")}
      value={value}
      placeholder={op === "in" ? "a, b, c" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
