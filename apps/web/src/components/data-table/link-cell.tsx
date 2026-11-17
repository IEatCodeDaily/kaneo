import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { upsertDataTableCell } from "@/fetchers/data-table/data-table";
import {
  getLinkedRecords,
  getLinkedRow,
  getLinkOptions,
  type LinkOptions,
  type LinkPage,
  linkRequest,
} from "@/fetchers/data-table/links";
import { cn } from "@/lib/cn";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
  LinkedRecord,
  LinkValue,
} from "@/types/data-table";
import type { MemberOption } from "./data-table-cells";
import { NewRowDialog } from "./new-row-dialog";
import { RowSheet } from "./row-sheet";
import { TicketLookupContext } from "./ticket-cell";

const OpenRecordContext = createContext<
  ((record: LinkedRecord) => void) | null
>(null);
export function linkValue(value: unknown): LinkValue | null {
  return value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "link"
    ? (value as LinkValue)
    : null;
}
export function LinkCellView({
  value,
  expanded = false,
}: {
  value: unknown;
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const open = useContext(OpenRecordContext);
  const cell = linkValue(value);
  if (cell?.status === "unavailable")
    return (
      <span className="text-muted-foreground">
        {t("navigation:tables.linkUnavailable")}
      </span>
    );
  if (!cell?.records.length)
    return <span className="text-faint-foreground">—</span>;
  const shown = expanded ? cell.records : cell.records.slice(0, 1);
  return (
    <span
      className={cn(
        "flex w-full min-w-0 items-center gap-1",
        expanded ? "flex-wrap" : "overflow-hidden",
      )}
    >
      {shown.map((record) => (
        <Button
          key={record.id}
          type="button"
          variant="outline"
          size="xs"
          data-link-chip
          className="min-w-0 max-w-full justify-start font-normal"
          onClick={(event) => {
            event.stopPropagation();
            open?.(record);
          }}
        >
          <span className="truncate">{record.label}</span>
        </Button>
      ))}
      {(cell.total ?? 0) > shown.length && (
        <span className="shrink-0 text-xs text-muted-foreground">
          +{(cell.total ?? 0) - shown.length}
        </span>
      )}
    </span>
  );
}
export function LinkCellPicker({
  field,
  value,
  rowId,
  canEdit,
  onCommit,
  children,
  members,
}: {
  field: DataTableField;
  value: unknown;
  rowId: string;
  canEdit: boolean;
  onCommit: (value: unknown) => void;
  children: React.ReactNode;
  members: Map<string, MemberOption>;
}) {
  const { t } = useTranslation();
  const context = useContext(TicketLookupContext);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LinkOptions | null>(null);
  const [selected, setSelected] = useState<LinkPage | null>(null);
  const [draft, setDraft] = useState<LinkedRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [create, setCreate] = useState(false);
  const [stack, setStack] = useState<
    { tableId: string; record: LinkedRecord }[]
  >([]);
  const navigation = useContext(LinkNavigationContext);
  const cell = linkValue(value);
  const targetTable = field.options?.targetTableId;
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["data-table", context.organizationId],
    });
    void queryClient.invalidateQueries({ queryKey: ["data-table-activity"] });
    window.dispatchEvent(new Event("table-links-updated"));
  };
  useEffect(() => {
    if (!open || field.options?.unavailable || !field.options?.relationId)
      return;
    void revision;
    let cancelled = false;
    setLoading(true);
    setError("");
    setOptions(null);
    const timer = setTimeout(() => {
      Promise.all([
        getLinkOptions(context.organizationId, field.tableId, field.id, query),
        rowId
          ? getLinkedRecords(
              context.organizationId,
              field.tableId,
              rowId,
              field.id,
            )
          : Promise.resolve(null),
      ])
        .then(([next, links]) => {
          if (!cancelled) {
            setOptions(next);
            setSelected(links);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setError(
              error instanceof Error
                ? error.message
                : "Relationship unavailable",
            );
            setSelected(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    open,
    query,
    revision,
    rowId,
    field.id,
    field.tableId,
    field.options?.relationId,
    field.options?.unavailable,
    context.organizationId,
  ]);
  const linked = rowId ? (selected?.records ?? cell?.records ?? []) : draft;
  const editable = canEdit && options?.canLink;
  const change = async (record: LinkedRecord, remove = false) => {
    if (!editable || busy) return;
    if (!rowId) {
      const next = remove
        ? draft.filter((item) => item.id !== record.id)
        : field.options?.localMax === "one"
          ? [record]
          : [...draft, record];
      setDraft(next);
      onCommit(next.map((item) => item.id));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const swap = !remove && field.options?.localMax === "one";
      const payload = {
        add: remove ? [] : [record.id],
        remove: remove
          ? [record.id]
          : swap
            ? linked.map((item) => item.id)
            : [],
        ...(swap ? { ifVersion: selected?.version ?? cell?.version } : {}),
      };
      await linkRequest(
        context.organizationId,
        field.tableId,
        `/rows/${rowId}/links/${field.id}`,
        payload,
      );
      refresh();
      setRevision((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("navigation:tables.linkUnavailable"),
      );
    } finally {
      setBusy(false);
    }
  };
  const openRecord = (record: LinkedRecord) => {
    if (targetTable && !record.deleted) {
      setOpen(false);
      if (navigation)
        navigation.setStack([
          ...navigation.stack,
          { tableId: targetTable, record },
        ]);
      else setStack([{ tableId: targetTable, record }]);
    }
  };
  return (
    <OpenRecordContext.Provider value={openRecord}>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {rowId ? (
          children
        ) : (
          <LinkCellView
            value={{
              kind: "link",
              status: "ok",
              records: draft,
              total: draft.length,
              hasMore: false,
              version: null,
            }}
            expanded
          />
        )}
        {!field.options?.unavailable && field.options?.relationId && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("navigation:tables.linkRecords")}
                data-link-picker-trigger
                onKeyDown={(event) => event.stopPropagation()}
              >
                <span aria-hidden>⋯</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              inset="panel"
              className="w-80 max-w-full"
              align="start"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (
                  !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                )
                  return;
                const buttons = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="option"]:not(:disabled)',
                  ),
                ];
                if (!buttons.length) return;
                event.preventDefault();
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                buttons[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowUp" ? -1 : 1) +
                          buttons.length) %
                        buttons.length
                ]?.focus();
              }}
            >
              <div className="space-y-2" data-link-picker>
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("navigation:tables.searchLinkedRecords")}
                  aria-label={t("navigation:tables.searchLinkedRecords")}
                />
                {loading && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t("navigation:tables.linkLoading")}
                  </p>
                )}
                {error && (
                  <div
                    role="alert"
                    className="space-y-2 text-xs text-destructive"
                  >
                    <p>{error}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      {t("navigation:tables.linkRetry")}
                    </Button>
                  </div>
                )}
                {options && !options.canLink && (
                  <p className="text-xs text-muted-foreground">
                    {t("navigation:tables.linkMutualEdit")}
                  </p>
                )}
                <div
                  className="max-h-64 space-y-1 overflow-y-auto"
                  role="listbox"
                  aria-label={t("navigation:tables.linkRecords")}
                  aria-multiselectable={field.options?.localMax === "many"}
                >
                  {linked.map((record) => (
                    <div
                      key={record.id}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        role="option"
                        aria-selected
                        className="min-w-0 flex-1 justify-start"
                        onClick={() => openRecord(record)}
                        disabled={record.deleted}
                      >
                        <span className="truncate">{record.label}</span>
                        <Check className="ml-auto size-3" />
                      </Button>
                      {editable && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={busy}
                          aria-label={t("navigation:tables.unlinkRecord", {
                            label: record.label,
                          })}
                          onClick={() => void change(record, true)}
                        >
                          <X className="size-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {selected?.hasMore && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading || busy}
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const page = await getLinkedRecords(
                            context.organizationId,
                            field.tableId,
                            rowId,
                            field.id,
                            selected.nextCursor ?? 0,
                          );
                          setSelected(
                            (current) =>
                              current && {
                                ...page,
                                records: [...current.records, ...page.records],
                              },
                          );
                        } catch (error) {
                          setError(String(error));
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      {t("navigation:tables.linkMore")}
                    </Button>
                  )}
                  {options?.records
                    .filter(
                      (record) =>
                        !linked.some((item) => item.id === record.id) &&
                        record.id !== rowId,
                    )
                    .map((record) => (
                      <Button
                        key={record.id}
                        size="sm"
                        variant="ghost"
                        type="button"
                        role="option"
                        aria-selected={false}
                        disabled={!editable || busy}
                        className="w-full min-w-0 justify-start"
                        onClick={() => void change(record)}
                      >
                        <span className="truncate">{record.label}</span>
                      </Button>
                    ))}
                </div>
                {options?.hasMore && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={loading || busy}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const page = await getLinkOptions(
                          context.organizationId,
                          field.tableId,
                          field.id,
                          query,
                          options.nextCursor ?? "",
                        );
                        setOptions(
                          (current) =>
                            current && {
                              ...page,
                              records: [...current.records, ...page.records],
                            },
                        );
                      } catch (error) {
                        setError(String(error));
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {t("navigation:tables.linkMore")}
                  </Button>
                )}
                {!loading && options && !options.records.length && (
                  <p className="text-xs text-muted-foreground">
                    {t("navigation:tables.linkNoMatches")}
                  </p>
                )}
                {rowId && options?.canCreate && canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => {
                      setOpen(false);
                      setCreate(true);
                    }}
                  >
                    {t("navigation:tables.createLinkedRecord")}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {create && options && (
        <NewRowDialog
          tableName={field.name}
          fields={options.fields.filter((field) => field.type !== "link")}
          members={members}
          initialValues={{}}
          onOpenChange={setCreate}
          onCreate={async (values) => {
            await linkRequest(
              context.organizationId,
              field.tableId,
              `/rows/${rowId}/links/${field.id}/new-row`,
              { values, ifVersion: selected?.version ?? cell?.version },
            );
            refresh();
            setRevision((value) => value + 1);
          }}
        />
      )}
      {!navigation && stack.length > 0 && (
        <LinkedDrawer
          organizationId={context.organizationId}
          stack={stack}
          setStack={setStack}
          members={members}
        />
      )}
    </OpenRecordContext.Provider>
  );
}
type NavigationEntry = { tableId: string; record: LinkedRecord };
export const LinkNavigationContext = createContext<{
  stack: NavigationEntry[];
  setStack: (stack: NavigationEntry[]) => void;
} | null>(null);
export function LinkNavigationProvider({
  organizationId,
  members,
  children,
}: {
  organizationId: string;
  members: Map<string, MemberOption>;
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<NavigationEntry[]>([]);
  return (
    <LinkNavigationContext.Provider value={{ stack, setStack }}>
      {children}
      {stack.length > 0 && (
        <LinkedDrawer
          organizationId={organizationId}
          stack={stack}
          setStack={setStack}
          members={members}
        />
      )}
    </LinkNavigationContext.Provider>
  );
}
function LinkedDrawer({
  organizationId,
  stack,
  setStack,
  members,
}: {
  organizationId: string;
  stack: NavigationEntry[];
  setStack: (stack: NavigationEntry[]) => void;
  members: Map<string, MemberOption>;
}) {
  const { t } = useTranslation();
  const current = stack[stack.length - 1]!;
  const [data, setData] = useState<{
    row: DataTableRow;
    fields: DataTableField[];
    canEdit: boolean;
    table: DataTable;
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("table-links-updated", refresh);
    return () => window.removeEventListener("table-links-updated", refresh);
  }, []);
  useEffect(() => {
    void revision;
    let cancelled = false;
    setData(null);
    setError("");
    getLinkedRow(organizationId, current.tableId, current.record.id)
      .then((data) => {
        if (!cancelled) setData(data);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, current.tableId, current.record.id, revision]);
  if (!data)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) setStack([]);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("navigation:tables.linkRecords")}</SheetTitle>
          </SheetHeader>
          {error ? (
            <div role="alert" className="space-y-2">
              <p>{error}</p>
              <Button
                size="sm"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t("navigation:tables.linkRetry")}
              </Button>
            </div>
          ) : (
            <p role="status">{t("navigation:tables.linkLoading")}</p>
          )}
        </SheetContent>
      </Sheet>
    );
  return (
    <TicketLookupContext.Provider
      value={{
        organizationId,
        organizationSlug: "",
        tableId: current.tableId,
        tickets: data.table.tickets ?? {},
      }}
    >
      <RowSheet
        linked
        open
        onOpenChange={(open) => {
          if (!open) setStack([]);
        }}
        table={data.table}
        row={data.row}
        fields={data.fields}
        rowIndex={-1}
        rowCount={0}
        members={members}
        canEdit={data.canEdit}
        hasPrev={false}
        hasNext={false}
        onPrev={() => {}}
        onNext={() => {}}
        onBack={() => setStack(stack.slice(0, -1))}
        onCommit={async (row, field, value) => {
          try {
            const updated = await upsertDataTableCell({
              organizationId,
              tableId: current.tableId,
              rowId: row.id,
              fieldId: field.id,
              value,
            });
            setData({ ...data, row: updated });
            return true;
          } catch (error) {
            setError(String(error));
            return false;
          }
        }}
      />
    </TicketLookupContext.Provider>
  );
}
