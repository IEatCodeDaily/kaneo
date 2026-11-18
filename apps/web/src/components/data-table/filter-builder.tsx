import { Plus, Trash2 } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTicketOptions } from "@/fetchers/data-table/data-table";
import { getLinkOptions } from "@/fetchers/data-table/links";
import type {
  DataTableField,
  FilterCondition,
  FilterGroup,
  FilterOperator,
} from "@/types/data-table";
import {
  filterOperators,
  listOperator,
  MAX_FILTER_CONDITIONS,
  MAX_FILTER_DEPTH,
  valuelessOperator,
} from "../../../../api/src/data-table/filter-expression";
import type { MemberOption } from "./data-table-cells";
import { FieldSelect } from "./data-table-toolbar";
import { TicketLookupContext } from "./ticket-cell";

export const emptyFilterGroup = (): FilterGroup => ({
  conjunction: "and",
  children: [],
});
export const newFilterCondition = (field: DataTableField): FilterCondition => ({
  id: crypto.randomUUID(),
  fieldId: field.id,
  op: filterOperators(field.type)[0] ?? "eq",
});
export function filterConditions(group: FilterGroup): FilterCondition[] {
  return group.children.flatMap((child) =>
    "conjunction" in child ? filterConditions(child) : [child],
  );
}
export function conditionActive(condition: FilterCondition): boolean {
  return (
    valuelessOperator(condition.op) ||
    (condition.value !== undefined &&
      (!Array.isArray(condition.value) || condition.value.length > 0))
  );
}
export function pruneFilterGroup(
  group: FilterGroup,
  keep: (condition: FilterCondition) => boolean,
): FilterGroup {
  return {
    ...group,
    children: group.children.flatMap<FilterCondition | FilterGroup>((child) => {
      if (!("conjunction" in child)) return keep(child) ? [child] : [];
      const next = pruneFilterGroup(child, keep);
      return next.children.length ? [next] : [];
    }),
  };
}
export function operatorKey(op: FilterOperator, type: string): string {
  const key = ["date", "datetime"].includes(type)
    ? (
        {
          lt: "before",
          gt: "after",
          lte: "onOrBefore",
          gte: "onOrAfter",
        } as Record<string, string>
      )[op]
    : ["number", "percent", "currency"].includes(type)
      ? ({ eq: "equals", neq: "notEquals" } as Record<string, string>)[op]
      : undefined;
  return `navigation:tables.filterOperators.${key ?? op}`;
}

type Props = {
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  filters: FilterGroup;
  onFiltersChange: (group: FilterGroup) => void;
};
export function FilterBuilder({
  fields,
  members,
  filters,
  onFiltersChange,
}: Props) {
  const { t } = useTranslation();
  const count = filterConditions(filters).length;
  const nodes = (group: FilterGroup): number =>
    1 +
    group.children.reduce(
      (sum, child) => sum + ("conjunction" in child ? nodes(child) : 1),
      0,
    );
  const full = count >= MAX_FILTER_CONDITIONS || nodes(filters) >= 100;
  const renderGroup = (
    group: FilterGroup,
    depth: number,
    change: (next: FilterGroup) => void,
    remove?: () => void,
  ): React.ReactNode => (
    <div
      data-filter-group={depth}
      className="min-w-0 space-y-2 rounded-md border border-l-2 border-l-input bg-background p-2"
    >
      <div
        className={
          depth === 1
            ? "sticky top-0 z-10 flex items-center gap-2 bg-background"
            : "flex items-center gap-2 bg-background"
        }
      >
        <Select
          value={group.conjunction}
          onValueChange={(value) =>
            change({ ...group, conjunction: value === "or" ? "or" : "and" })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-24"
            aria-label={t("navigation:tables.filterConjunction")}
          >
            <SelectValue>
              {t(`navigation:tables.${group.conjunction}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">{t("navigation:tables.and")}</SelectItem>
            <SelectItem value="or">{t("navigation:tables.or")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="flex-1 text-xs text-muted-foreground">
          {t(
            group.conjunction === "and"
              ? "navigation:tables.matchAll"
              : "navigation:tables.matchAny",
          )}
        </span>
        {remove && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("navigation:tables.removeGroup")}
            onClick={remove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {group.children.map((child, index) => {
        const update = (next: FilterCondition | FilterGroup) =>
          change({
            ...group,
            children: group.children.map((c, i) => (i === index ? next : c)),
          });
        const drop = () =>
          change({
            ...group,
            children: group.children.filter((_, i) => i !== index),
          });
        if ("conjunction" in child)
          return (
            <div key={child.id ?? index}>
              {renderGroup(child, depth + 1, update, drop)}
            </div>
          );
        const field = fields.find((f) => f.id === child.fieldId);
        return (
          <div
            data-filter-condition
            key={child.id ?? index}
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1 rounded-md border p-2"
          >
            <div className="flex min-w-0 items-center [&>div]:min-w-0 [&>div]:flex-1">
              <FieldSelect
                className="min-w-0 flex-1"
                fields={fields}
                value={child.fieldId}
                placeholder={t("navigation:tables.pickField")}
                onChange={(id) => {
                  const next = fields.find((f) => f.id === id);
                  if (next)
                    update({ ...newFilterCondition(next), id: child.id });
                }}
              />
            </div>
            {field && (
              <Select
                value={child.op}
                onValueChange={(op) =>
                  op &&
                  update({
                    id: child.id,
                    fieldId: child.fieldId,
                    op: op as FilterOperator,
                  })
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  aria-label={t("navigation:tables.filterOperator")}
                >
                  <SelectValue>
                    {t(operatorKey(child.op, field.type))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filterOperators(field.type).map((op) => (
                    <SelectItem key={op} value={op}>
                      {t(operatorKey(op, field.type))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!field && <span />}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.removeFilter")}
              onClick={drop}
            >
              <Trash2 className="size-3.5" />
            </Button>
            {field && (
              <>
                {!valuelessOperator(child.op) && (
                  <div className="col-span-3 min-w-0">
                    <ConditionValue
                      condition={child}
                      field={field}
                      members={members}
                      onChange={update}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      {!group.children.length && (
        <p className="text-xs text-muted-foreground">
          {t("navigation:tables.noFilters")}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={
            !fields[0] || full || group.children.length >= MAX_FILTER_CONDITIONS
          }
          onClick={() =>
            fields[0] &&
            change({
              ...group,
              children: [...group.children, newFilterCondition(fields[0])],
            })
          }
        >
          <Plus className="size-3.5" />
          {t("navigation:tables.addFilter")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={
            depth >= MAX_FILTER_DEPTH ||
            full ||
            group.children.length >= MAX_FILTER_CONDITIONS
          }
          onClick={() =>
            change({
              ...group,
              children: [
                ...group.children,
                { ...emptyFilterGroup(), id: crypto.randomUUID() },
              ],
            })
          }
        >
          <Plus className="size-3.5" />
          {t("navigation:tables.addFilterGroup")}
        </Button>
      </div>
    </div>
  );
  return (
    <div data-filter-builder className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t("navigation:tables.filterHelp")}
      </p>
      <div className="max-h-96 overflow-y-auto sm:max-h-112">
        {renderGroup(filters, 1, onFiltersChange)}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={!filters.children.length}
        onClick={() => onFiltersChange(emptyFilterGroup())}
      >
        {t("navigation:tables.clearFilters")}
      </Button>
    </div>
  );
}
function ConditionValue({
  condition,
  field,
  members,
  onChange,
}: {
  condition: FilterCondition;
  field: DataTableField;
  members: Map<string, MemberOption>;
  onChange: (condition: FilterCondition) => void;
}) {
  const { t } = useTranslation();
  const context = useContext(TicketLookupContext);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState(false);
  const remoteType = field.type === "ticket" || field.type === "link";
  useEffect(() => {
    if (!remoteType) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setError(false);
      const load =
        field.type === "ticket"
          ? getTicketOptions(
              {
                organizationId: context.organizationId,
                tableId: field.tableId,
              },
              field.id,
              query,
            ).then((tickets) =>
              tickets.map((ticket) => ({
                id: ticket.id,
                label: `${ticket.key} · ${ticket.title}`,
              })),
            )
          : getLinkOptions(
              context.organizationId,
              field.tableId,
              field.id,
              query,
            ).then((page) => page.records);
      void load
        .then((options) => {
          if (!cancelled) setRemote(options);
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
            setRemote([]);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    remoteType,
    field.type,
    field.id,
    field.tableId,
    context.organizationId,
    query,
  ]);
  const options =
    field.type === "user"
      ? Array.from(members, ([id, member]) => ({
          id,
          label:
            member.user.name ||
            member.user.email ||
            t("navigation:tables.formerMember"),
        }))
      : remoteType
        ? remote
        : field.options?.choices;
  if (options) {
    const selected = Array.isArray(condition.value)
      ? condition.value
      : typeof condition.value === "string"
        ? [condition.value]
        : [];
    return (
      <div className="space-y-1">
        {remoteType && (
          <Input
            size="sm"
            aria-label={t("navigation:tables.searchFilterValues")}
            placeholder={t("navigation:tables.searchFilterValues")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <Select
          value={null}
          onValueChange={(id) => {
            if (!id) return;
            onChange({
              ...condition,
              value: listOperator(condition.op)
                ? selected.includes(String(id))
                  ? selected.filter((v) => v !== id)
                  : [...selected, String(id)]
                : String(id),
            });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full min-w-0"
            aria-label={t("navigation:tables.filterValue")}
          >
            <SelectValue placeholder={t("navigation:tables.selectChoice")}>
              {selected.length
                ? t("navigation:tables.filterSelected", {
                    count: selected.length,
                  })
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {selected.includes(option.id) ? "✓ " : ""}
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((id, index) => (
              <Button
                key={id}
                variant="outline"
                size="xs"
                onClick={() =>
                  onChange({
                    ...condition,
                    value: listOperator(condition.op)
                      ? selected.filter((v) => v !== id)
                      : undefined,
                  })
                }
              >
                {options.find((o) => o.id === id)?.label ??
                  t("navigation:tables.filterSelectedValue", {
                    number: index + 1,
                  })}{" "}
                ×
              </Button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive-foreground">
            {t("navigation:tables.queryError")}
          </p>
        )}
      </div>
    );
  }
  const numeric =
    ["number", "percent", "currency"].includes(field.type) ||
    ["pastDays", "nextDays"].includes(condition.op);
  const date = !numeric && ["date", "datetime"].includes(field.type);
  return (
    <Input
      size="sm"
      className="w-full min-w-0"
      aria-label={t("navigation:tables.filterValue")}
      type={
        numeric
          ? "number"
          : date
            ? field.type === "datetime"
              ? "datetime-local"
              : "date"
            : "text"
      }
      value={
        typeof condition.value === "string" ||
        typeof condition.value === "number"
          ? condition.value
          : ""
      }
      onChange={(e) =>
        onChange({
          ...condition,
          value: numeric
            ? e.target.value === ""
              ? undefined
              : Number(e.target.value)
            : date && e.target.value === ""
              ? undefined
              : e.target.value,
        })
      }
    />
  );
}
