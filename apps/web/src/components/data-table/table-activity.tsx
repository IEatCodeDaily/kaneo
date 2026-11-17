import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Download } from "lucide-react";
import { lazy, Suspense, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberOption } from "@/components/data-table/data-table-cells";
import { DataTableCellView } from "@/components/data-table/data-table-cells";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  createTableComment,
  exportTableHistory,
  getTableActivity,
  revertTableActivity,
} from "@/fetchers/data-table/data-table";
import { dataTableKeys } from "@/hooks/data-table/use-data-tables";
import { getAvatarTone } from "@/lib/avatar-tone";
import { formatDateMedium, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import {
  DATA_TABLE_FIELD_TYPES,
  type DataTable,
  type DataTableField,
  type TableActivity,
} from "@/types/data-table";
import { FIELD_TYPE_LABEL_KEYS } from "./data-table-format";
import { TicketLookupContext } from "./ticket-cell";

// Same composer as the ticket drawer; lazy keeps tiptap out of the grid chunk.
const CommentComposer = lazy(
  () => import("@/components/activity/comment-composer"),
);
// The ticket drawer's comment card, so both threads read the same.
const CommentCard = lazy(() => import("@/components/activity/comment-card"));
const PAGE_SIZE = 100;
const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null;

/** Use the archived definition, never today's type/choices for yesterday's value. */
function archivedField(value: unknown): DataTableField | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = value as DataTableField;
  return typeof field.id === "string" &&
    typeof field.name === "string" &&
    DATA_TABLE_FIELD_TYPES.includes(field.type)
    ? field
    : undefined;
}

export function TableActivityList({
  table,
  fields,
  members,
  rowId,
  canEdit = false,
}: {
  table: DataTable;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  rowId?: string;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const lookup = useContext(TicketLookupContext);
  const target = { organizationId: table.organizationId, tableId: table.id };
  const [restore, setRestore] = useState<TableActivity | null>(null);
  const activity = useInfiniteQuery({
    queryKey: [...dataTableKeys.activity(table.id), rowId ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getTableActivity(target, rowId, pageParam, PAGE_SIZE),
    getNextPageParam: (last, pages) =>
      last.length === PAGE_SIZE
        ? pages.reduce((n, page) => n + page.length, 0)
        : undefined,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: dataTableKeys.activity(table.id) }),
      client.invalidateQueries({
        queryKey: dataTableKeys.detail(table.organizationId, table.id),
      }),
    ]);
  const postComment = async (content: string) => {
    await createTableComment(target, content, rowId);
    await refresh();
  };
  const revert = useMutation({
    mutationFn: (id: string) => revertTableActivity(target, id),
    onSuccess: async () => {
      setRestore(null);
      await refresh();
    },
    onError: () => toast.error(t("navigation:tables.revertConflict")),
  });
  const download = useMutation({
    mutationFn: () => exportTableHistory(target),
    onSuccess: (archive) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(archive, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table.name}-history.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error(t("navigation:tables.historyError")),
  });
  // Offset pages can overlap when another writer appends; keep one event per id.
  const items = [
    ...new Map(
      (activity.data?.pages.flat() ?? []).map((item) => [item.id, item]),
    ).values(),
  ];

  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-slot="table-activity">
      {!rowId && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t("navigation:tables.historyBoundary")}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            <Download className="size-3.5" />
            {t("navigation:tables.exportHistory")}
          </Button>
        </div>
      )}
      {canEdit && (
        <Suspense fallback={null}>
          <CommentComposer
            key={rowId ?? table.id}
            draftKey={`table-comment:${table.id}:${rowId ?? "table"}`}
            onSubmit={postComment}
          />
        </Suspense>
      )}
      {activity.isError ? (
        <div className="flex items-center gap-2 text-xs">
          <span>{t("navigation:tables.historyError")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => activity.refetch()}
          >
            {t("navigation:tables.retry")}
          </Button>
        </div>
      ) : (
        !activity.isLoading &&
        items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("navigation:tables.noActivity")}
          </p>
        )
      )}
      <ol className="flex min-w-0 flex-col gap-4">
        {items.map((item) => {
          const data = item.data ?? {};
          const field =
            archivedField(data.field) ??
            archivedField(data.afterField) ??
            fieldsById.get(item.fieldId ?? "");
          if (item.type === "comment_added")
            return (
              <li key={item.id} className="min-w-0">
                <Suspense fallback={null}>
                  <CommentCard
                    commentId={item.id}
                    taskId=""
                    content={text(data.content) ?? ""}
                    user={{
                      id: item.userId ?? undefined,
                      name: item.userName ?? t("navigation:tables.someone"),
                      image: item.userImage,
                    }}
                    createdAt={item.createdAt}
                    editable={false}
                  />
                </Suspense>
              </li>
            );
          return (
            <li
              key={item.id}
              className="flex min-w-0 items-start gap-2 text-ui"
            >
              <Actor item={item} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {item.userName ?? t("navigation:tables.someone")}
                  </span>{" "}
                  {sentence(t, item, field, !rowId)}
                  {" · "}
                  <time
                    className="text-xs text-faint-foreground"
                    dateTime={item.createdAt}
                    title={formatDateMedium(item.createdAt)}
                  >
                    {formatRelativeTime(item.createdAt)}
                  </time>
                </p>
                {item.type === "cell_updated" && (
                  <TicketLookupContext.Provider
                    value={{
                      ...lookup,
                      tickets: {
                        ...lookup.tickets,
                        ...((data.tickets as typeof lookup.tickets) ?? {}),
                      },
                    }}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <HistoryValue
                        field={field}
                        value={data.from}
                        members={members}
                      />
                      <span className="text-faint-foreground">→</span>
                      <HistoryValue
                        field={field}
                        value={data.to}
                        members={members}
                      />
                    </div>
                  </TicketLookupContext.Provider>
                )}
                {text(data.fromType) && text(data.toType) && (
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(t, data.fromType)} → {typeLabel(t, data.toType)}
                  </p>
                )}
                <details className="min-w-0 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {t("navigation:tables.activityDetails")}
                  </summary>
                  <TicketLookupContext.Provider
                    value={{
                      ...lookup,
                      tickets: {
                        ...lookup.tickets,
                        ...((data.tickets as typeof lookup.tickets) ?? {}),
                      },
                    }}
                  >
                    <SnapshotDetails data={data} members={members} />
                  </TicketLookupContext.Provider>
                  <details>
                    <summary className="cursor-pointer text-faint-foreground">
                      {t("navigation:tables.rawEventData")}
                    </summary>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-secondary p-2">
                      {JSON.stringify(
                        { rowId: item.rowId, fieldId: item.fieldId, ...data },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </details>
                {canEdit &&
                  item.type === "field_updated" &&
                  Boolean(data.fromType && data.toType && data.beforeField) && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="self-start"
                      onClick={() => setRestore(item)}
                    >
                      {t("navigation:tables.revertField")}
                    </Button>
                  )}
              </div>
            </li>
          );
        })}
      </ol>
      {activity.hasNextPage && (
        <Button
          size="sm"
          variant="outline"
          disabled={activity.isFetchingNextPage}
          onClick={() => activity.fetchNextPage()}
        >
          {t("navigation:tables.loadOlderActivity")}
        </Button>
      )}
      <AlertDialog
        open={restore !== null}
        onOpenChange={(open) => {
          if (!open && !revert.isPending) setRestore(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:tables.revertField")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:tables.revertFieldHint")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={revert.isPending}
              render={<AlertDialogClose />}
            >
              {t("navigation:tables.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={revert.isPending}
              onClick={() => {
                if (restore) revert.mutate(restore.id);
              }}
            >
              {t("navigation:tables.revertField")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SnapshotDetails({
  data,
  members,
}: {
  data: Record<string, unknown>;
  members: Map<string, MemberOption>;
}) {
  const { t } = useTranslation();
  const definitions = Array.isArray(data.fields)
    ? data.fields
        .map(archivedField)
        .filter((field): field is DataTableField => Boolean(field))
    : [];
  const row =
    data.row && typeof data.row === "object"
      ? (data.row as { values?: Record<string, unknown> })
      : undefined;
  const values =
    row?.values ??
    (data.values && typeof data.values === "object"
      ? (data.values as Record<string, unknown>)
      : undefined);
  const before = archivedField(data.beforeField);
  const after = archivedField(data.afterField) ?? archivedField(data.field);
  return (
    <div className="my-2 flex min-w-0 flex-col gap-2">
      {values &&
        definitions.map((field) => (
          <div key={field.id} className="flex min-w-0 gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">
              {field.name}
            </span>
            <HistoryValue
              field={field}
              value={values[field.id]}
              members={members}
            />
          </div>
        ))}
      {(before || after) && (
        <p className="text-muted-foreground">
          {[before, after]
            .filter((field): field is DataTableField => Boolean(field))
            .map((field) => `${field.name} (${typeLabel(t, field.type)})`)
            .join(" → ")}
        </p>
      )}
      {before && Array.isArray(data.beforeColumn) && (
        <details>
          <summary className="cursor-pointer">
            {t("navigation:tables.savedColumnValues", {
              count: data.beforeColumn.length,
            })}
          </summary>
          <div className="max-h-64 overflow-auto">
            {data.beforeColumn.map((entry) => {
              const cell = entry as { id: string; value: unknown };
              return (
                <div className="flex min-w-0 gap-2 py-1" key={cell.id}>
                  <span
                    className="w-28 shrink-0 truncate font-mono text-faint-foreground"
                    title={cell.id}
                  >
                    {cell.id}
                  </span>
                  <HistoryValue
                    field={before}
                    value={cell.value}
                    members={members}
                  />
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function typeLabel(t: TFunction, value: unknown): string {
  return typeof value === "string" && value in FIELD_TYPE_LABEL_KEYS
    ? t(FIELD_TYPE_LABEL_KEYS[value as keyof typeof FIELD_TYPE_LABEL_KEYS])
    : t("navigation:tables.unknownValue");
}

function Actor({ item }: { item: TableActivity }) {
  const name = item.userName ?? "";
  return (
    <Avatar
      className={`size-5 shrink-0 ${!item.userImage ? getAvatarTone(item.userId, name) : ""}`}
    >
      {item.userImage && <AvatarImage src={item.userImage} alt={name} />}
      <AvatarFallback className="text-xs font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function HistoryValue({
  field,
  value,
  members,
}: {
  field?: DataTableField;
  value: unknown;
  members: Map<string, MemberOption>;
}) {
  return (
    <div className="min-w-0 max-w-full text-xs">
      {field ? (
        <DataTableCellView field={field} value={value} members={members} />
      ) : (
        <span className="break-words">
          {value == null
            ? "—"
            : typeof value === "string"
              ? value
              : JSON.stringify(value)}
        </span>
      )}
    </div>
  );
}

function sentence(
  t: TFunction,
  item: TableActivity,
  field: DataTableField | undefined,
  withRow: boolean,
): string {
  const data = item.data ?? {};
  const row = text(data.title) ?? t("navigation:tables.untitledRow");
  const fieldName =
    text(data.name) ?? field?.name ?? t("navigation:tables.unknownValue");
  switch (item.type) {
    case "row_created":
      return t("navigation:tables.activityRowCreated", { row });
    case "row_deleted":
      return t("navigation:tables.activityRowDeleted", { row });
    case "cell_updated":
      return t(
        withRow
          ? "navigation:tables.activityCellUpdatedIn"
          : "navigation:tables.activityCellUpdated",
        { field: fieldName, row },
      );
    case "field_created":
      return t("navigation:tables.activityFieldCreated", { field: fieldName });
    case "field_deleted":
      return t("navigation:tables.activityFieldDeleted", { field: fieldName });
    case "field_updated":
      return t(
        text(data.fromName)
          ? "navigation:tables.activityFieldRenamed"
          : text(data.fromType)
            ? "navigation:tables.activityFieldRetyped"
            : "navigation:tables.activityFieldOptions",
        { from: text(data.fromName), field: fieldName },
      );
    case "link_added":
      return t("navigation:tables.activityLinkAdded", {
        label: text(data.label) ?? t("navigation:tables.linkUnavailable"),
      });
    case "link_removed":
      return t("navigation:tables.activityLinkRemoved", {
        label: text(data.label) ?? t("navigation:tables.linkUnavailable"),
      });
    case "links_migrated":
      return t("navigation:tables.activityLinksMigrated");
    case "ticket_linked":
      return t("navigation:tables.activityTicketLinked", {
        ticket: [text(data.key), text(data.title)].filter(Boolean).join(" "),
      });
    case "ticket_unlinked":
      return t("navigation:tables.activityTicketUnlinked", {
        ticket: [text(data.key), text(data.title)].filter(Boolean).join(" "),
      });
    case "comment_added":
      return t("navigation:tables.activityCommentAdded");
    case "field_reverted":
      return t("navigation:tables.activityFieldReverted", { field: fieldName });
    case "baseline":
      return t("navigation:tables.activityBaseline");
    case "table_created":
      return t("navigation:tables.activityTableCreated");
    case "table_updated":
      return t("navigation:tables.activityTableUpdated");
    case "table_deleted":
      return t("navigation:tables.activityTableDeleted");
    case "table_restored":
      return t("navigation:tables.activityTableRestored");
    default:
      return t("navigation:tables.activityUpdated");
  }
}
