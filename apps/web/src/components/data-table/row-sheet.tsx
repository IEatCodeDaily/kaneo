import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LockKeyhole,
  Table2,
  X,
} from "lucide-react";
import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberOption } from "@/components/data-table/data-table-cells";
import {
  DataTableCellView,
  FieldTypeIcon,
} from "@/components/data-table/data-table-cells";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
import {
  fieldValue,
  systemFields,
} from "@/components/data-table/data-table-format";
import { TableActivityList } from "@/components/data-table/table-activity";
import { TicketLookupContext } from "@/components/data-table/ticket-cell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getRowTickets } from "@/fetchers/data-table/row-links";
import { useDrawerWidth } from "@/hooks/use-drawer-width";
import { getColumnIcon } from "@/lib/column";
import { rowDrawerDefaultWidth } from "@/lib/task-drawer-width";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
} from "@/types/data-table";
import { LinkNavigationContext } from "./link-cell";

/**
 * Drawer sections below the fold (linked tickets, activity) defer their
 * queries until the reader scrolls near: both fired on the drawer's open
 * path and painted after it. jsdom has no IntersectionObserver — render
 * immediately there. The node arrives AFTER the first paint (the drawer
 * mounts empty with row=null), so observation starts from the callback ref,
 * not a mount-time effect.
 */
function useInViewOnce<T extends HTMLElement>() {
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const [node, setNode] = useState<T | null>(null);
  useEffect(() => {
    if (inView || !node || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // Start loading slightly before the section actually scrolls in.
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, node]);
  const ref = useCallback((next: T | null) => setNode(next), []);
  return { ref, inView };
}

/**
 * Row drawer, laid out like the ticket drawer but fields only: a top bar
 * (table · row n of N, prev/next, copy id, close), the row title, every field
 * as a property row, the tickets linked to the row, and the row's history.
 */
export function RowSheet({
  open,
  linked = false,
  onBack,
  onOpenChange,
  table,
  row,
  rowIndex,
  rowCount,
  fields,
  members,
  canEdit,
  onCommit,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  open: boolean;
  linked?: boolean;
  onBack?: () => void;
  onOpenChange: (open: boolean) => void;
  table: DataTable;
  row: DataTableRow | null;
  /** 0-based position in the current view, -1 when filtered out. */
  rowIndex: number;
  rowCount: number;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  canEdit: boolean;
  onCommit: (
    row: DataTableRow,
    field: DataTableField,
    value: unknown,
  ) => Promise<boolean>;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { t } = useTranslation();
  const navigation = useContext(LinkNavigationContext);
  const { organizationSlug, tickets: ticketLookup } =
    useContext(TicketLookupContext);
  // Editing is scoped to the current row: TableCellInput seeds its draft
  // once, so an editor left open across prev/next would write row N's text
  // into row N+1. Row-scoping unmounts it on every row switch instead.
  const [editing, setEditing] = useState<{
    rowId: string;
    fieldId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const lower = useInViewOnce<HTMLDivElement>();
  const { width, startResize } = useDrawerWidth(
    "kaneo:row-drawer-width",
    // Half the viewport until the user drags (clamped by the shared min/max);
    // a stored width wins.
    rowDrawerDefaultWidth,
  );

  const tickets = useQuery({
    queryKey: ["row-tickets", table.organizationId, table.id, row?.id],
    enabled: open && row !== null && lower.inView,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () =>
      getRowTickets({
        organizationId: table.organizationId,
        tableId: table.id,
        rowId: row?.id ?? "",
      }),
  });

  if (!row) return null;
  // The primary field need not be text: resolve it with the same renderer as
  // the property list rather than showing a choice UUID as the row title.
  const primaryField = fields[0];
  const cellTicketIds = new Set(
    fields
      .filter((field) => field.type === "ticket")
      .flatMap((field) => {
        const value = row.values[field.id];
        return Array.isArray(value)
          ? value.filter((id): id is string => typeof id === "string")
          : [];
      }),
  );
  const linkedTickets = new Map(
    (tickets.data ?? []).map((ticket) => [
      ticket.taskId,
      {
        id: ticket.taskId,
        key: ticket.key,
        title: ticket.taskTitle ?? ticket.title ?? "",
        status: ticket.taskStatus ?? "",
      },
    ]),
  );
  for (const id of cellTicketIds) {
    const ref = ticketLookup[id];
    if (ref) linkedTickets.set(id, ref);
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(row.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions); nothing to recover.
    }
  };

  return (
    <Sheet
      open={open && (linked || !navigation?.stack.length)}
      onOpenChange={onOpenChange}
    >
      <SheetContent
        side="right"
        size="sm"
        showCloseButton={false}
        // An explicit width wins over the size class once the user has dragged.
        style={width ? { width: `${width}px`, maxWidth: "100vw" } : undefined}
      >
        <div
          aria-hidden
          data-testid="row-drawer-resize-handle"
          onPointerDown={startResize}
          className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
        />
        {/* One bar, one close: the primitive's floating close used to sit on
            top of the copy button. */}
        <SheetHeader>
          <div className="flex items-center gap-1">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
              <Table2 className="size-3.5 shrink-0" />
              <span className="truncate">{table.name}</span>
              {rowIndex >= 0 && (
                <span className="shrink-0 tabular-nums text-faint-foreground">
                  {t("navigation:tables.rowOf", {
                    row: rowIndex + 1,
                    count: rowCount,
                  })}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.prevRow")}
              disabled={!hasPrev}
              onClick={onPrev}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.nextRow")}
              disabled={!hasNext}
              onClick={onNext}
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.copyRowId")}
              onClick={copyId}
            >
              {copied ? (
                <Check className="size-4 text-primary-soft-foreground" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common:actions.close")}
                />
              }
            >
              <X className="size-4" />
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">
            {t("navigation:tables.rowSheetTitle")}
          </SheetDescription>
        </SheetHeader>

        {onBack && (
          <Button size="sm" variant="ghost" onClick={onBack}>
            {t("navigation:tables.linkBack")}
          </Button>
        )}
        <SheetTitle className="text-xl font-semibold break-words">
          {primaryField &&
          row.values[primaryField.id] != null &&
          row.values[primaryField.id] !== "" ? (
            <DataTableCellView
              field={primaryField}
              value={row.values[primaryField.id]}
              members={members}
            />
          ) : (
            t("navigation:tables.untitledRow")
          )}
        </SheetTitle>

        <section className="flex flex-col gap-0.5" data-slot="row-fields">
          {fields.map((field) => (
            <div key={field.id} className="flex min-h-8 items-start gap-2">
              <span className="flex min-h-8 w-36 shrink-0 items-start gap-1.5 py-2 text-xs text-muted-foreground">
                <FieldTypeIcon type={field.type} />
                <span className="min-w-0">
                  <span className="block truncate">{field.name}</span>
                  {field.options?.description && (
                    <span className="block whitespace-normal text-xs font-normal">
                      {field.options.description}
                    </span>
                  )}
                </span>
              </span>
              {/* Key/value list: every value starts on one column, numbers too. */}
              <div className="flex min-h-8 min-w-0 flex-1 items-center rounded-md px-2 text-ui hover:bg-row-hover *:text-left!">
                <DataTableCellContent
                  expanded
                  row={row}
                  field={field}
                  members={members}
                  canEdit={canEdit}
                  isEditing={
                    editing?.rowId === row.id && editing.fieldId === field.id
                  }
                  onEditStart={() =>
                    setEditing({ rowId: row.id, fieldId: field.id })
                  }
                  onEditEnd={() => setEditing(null)}
                  onCommit={async (value) => {
                    if (await onCommit(row, field, value)) {
                      setEditing((current) =>
                        current?.rowId === row.id &&
                        current.fieldId === field.id
                          ? null
                          : current,
                      );
                    }
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        <details
          key={row.id}
          className="border-t pt-3"
          data-slot="row-system-fields"
        >
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {t("navigation:tables.systemSection")}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {systemFields(table.id, t).map((field) => (
              <div key={field.id} className="flex min-h-8 items-center gap-2">
                <span className="flex w-36 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3.5 shrink-0" />
                  {field.name}
                </span>
                <div className="min-w-0 flex-1 px-2 text-ui">
                  <DataTableCellView
                    field={field}
                    value={fieldValue(row, field)}
                    members={members}
                  />
                </div>
              </div>
            ))}
          </div>
        </details>

        {lower.inView ? (
          <>
            {/* Explicit row↔ticket links (made from a ticket's "Included in").
                Ticket cells already show in the fields above, so an empty list
                would only contradict them: render it when there is something. */}
            {linkedTickets.size > 0 && (
              <section className="flex flex-col gap-1 border-t pt-3">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t("navigation:tables.linkedTickets")}
                </h3>
                <ul className="flex flex-col">
                  {[...linkedTickets.values()].map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        to="/dashboard/$organizationSlug/tickets/$ticketKey"
                        params={{ organizationSlug, ticketKey: ticket.key }}
                        className="flex h-8 items-center gap-2 rounded-md px-2 text-ui hover:bg-row-hover"
                      >
                        <span className="shrink-0 [&_svg]:size-3.5">
                          {getColumnIcon(ticket.status)}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {ticket.key}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {ticket.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2 border-t pt-3">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t("navigation:tables.activity")}
              </h3>
              <TableActivityList
                key={row.id}
                canEdit={canEdit}
                table={table}
                fields={fields}
                members={members}
                rowId={row.id}
              />
            </section>
          </>
        ) : (
          // Sentinel: the tickets + activity queries mount once this
          // scrolls near (or immediately for a short drawer).
          <div
            ref={lower.ref}
            aria-hidden
            data-testid="row-drawer-deferred"
            className="min-h-12"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
