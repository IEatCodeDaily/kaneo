import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { MemberOption } from "@/components/data-table/data-table-cells";
import { DataTableCellView } from "@/components/data-table/data-table-cells";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getTableActivity } from "@/fetchers/data-table/data-table";
import { dataTableKeys } from "@/hooks/data-table/use-data-tables";
import { getAvatarTone } from "@/lib/avatar-tone";
import { formatDateMedium, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import type {
  DataTable,
  DataTableField,
  TableActivity,
} from "@/types/data-table";

/**
 * History of a table, or of one row (`rowId`): "Ayu created row PB-1042",
 * "Ayu changed Cost 3,180,000 → 3,200,000". Values render through the grid's
 * own cell views, so a select shows its chip and a user their avatar.
 */
export function TableActivityList({
  table,
  fields,
  members,
  rowId,
}: {
  table: DataTable;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  rowId?: string;
}) {
  const { t } = useTranslation();
  const activity = useQuery({
    queryKey: [...dataTableKeys.activity(table.id), rowId ?? null],
    queryFn: () =>
      getTableActivity(
        { organizationId: table.organizationId, tableId: table.id },
        rowId,
      ),
  });
  const fieldsById = new Map(fields.map((field) => [field.id, field]));

  if (activity.isLoading) return null;
  const items = activity.data ?? [];
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("navigation:tables.noActivity")}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" data-slot="table-activity">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2 text-ui">
          <Actor item={item} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {item.userName ?? t("navigation:tables.someone")}
              </span>{" "}
              {sentence(t, {
                item,
                field: fieldsById.get(item.fieldId ?? ""),
                withRow: !rowId,
              })}{" "}
              <time
                className="text-xs text-faint-foreground"
                dateTime={item.createdAt}
                title={formatDateMedium(item.createdAt)}
              >
                {formatRelativeTime(item.createdAt)}
              </time>
            </p>
            {item.type === "cell_updated" && (
              <ValueChange
                item={item}
                field={fieldsById.get(item.fieldId ?? "")}
                members={members}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Actor({ item }: { item: TableActivity }) {
  const name = item.userName ?? "";
  return (
    <Avatar className={`size-5 shrink-0 ${getAvatarTone(item.userId, name)}`}>
      {item.userImage ? <AvatarImage src={item.userImage} alt={name} /> : null}
      <AvatarFallback className="bg-transparent text-xs font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null;

function sentence(
  t: TFunction,
  {
    item,
    field,
    withRow,
  }: {
    item: TableActivity;
    field: DataTableField | undefined;
    withRow: boolean;
  },
): string | null {
  const data = item.data ?? {};
  const row = text(data.title) ?? t("navigation:tables.untitledRow");
  // Deleted fields keep their name in the log entry itself.
  const fieldName = field?.name ?? text(data.name) ?? "?";
  const ticket = [text(data.key), text(data.title)].filter(Boolean).join(" ");
  switch (item.type) {
    case "row_created":
      return t("navigation:tables.activityRowCreated", { row });
    case "row_deleted":
      return t("navigation:tables.activityRowDeleted", { row });
    case "cell_updated":
      return withRow
        ? t("navigation:tables.activityCellUpdatedIn", {
            field: fieldName,
            row,
          })
        : t("navigation:tables.activityCellUpdated", { field: fieldName });
    case "field_created":
      return t("navigation:tables.activityFieldCreated", { field: fieldName });
    case "field_updated":
      return text(data.fromName)
        ? t("navigation:tables.activityFieldRenamed", {
            from: text(data.fromName),
            field: fieldName,
          })
        : t("navigation:tables.activityFieldRetyped", { field: fieldName });
    case "field_deleted":
      return t("navigation:tables.activityFieldDeleted", { field: fieldName });
    case "ticket_linked":
      return t("navigation:tables.activityTicketLinked", { ticket });
    case "ticket_unlinked":
      return t("navigation:tables.activityTicketUnlinked", { ticket });
    default:
      return null;
  }
}

/** Old → new, drawn with the grid's cell views (chips, avatars, numbers). */
function ValueChange({
  item,
  field,
  members,
}: {
  item: TableActivity;
  field: DataTableField | undefined;
  members: Map<string, MemberOption>;
}) {
  // A deleted or retyped field cannot render old values faithfully.
  if (!field || field.type === "ticket") return null;
  const data = item.data ?? {};
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className="flex min-w-0 max-w-[45%] items-center line-through decoration-faint-foreground opacity-70">
        <DataTableCellView field={field} value={data.from} members={members} />
      </span>
      <span className="text-faint-foreground">→</span>
      <span className="flex min-w-0 max-w-[45%] items-center">
        <DataTableCellView field={field} value={data.to} members={members} />
      </span>
    </div>
  );
}
