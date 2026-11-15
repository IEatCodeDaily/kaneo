import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Copy, Table2, X } from "lucide-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberOption } from "@/components/data-table/data-table-cells";
import { FieldTypeIcon } from "@/components/data-table/data-table-cells";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
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
import { getColumnIcon } from "@/lib/column";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
} from "@/types/data-table";

/**
 * Row drawer, laid out like the ticket drawer but fields only: a top bar
 * (table · row n of N, prev/next, copy id, close), the row title, every field
 * as a property row, the tickets linked to the row, and the row's history.
 */
export function RowSheet({
  open,
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
  onOpenChange: (open: boolean) => void;
  table: DataTable;
  row: DataTableRow | null;
  /** 0-based position in the current view, -1 when filtered out. */
  rowIndex: number;
  rowCount: number;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  canEdit: boolean;
  onCommit: (row: DataTableRow, field: DataTableField, value: unknown) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { t } = useTranslation();
  const { organizationSlug } = useContext(TicketLookupContext);
  // Editing is scoped to the current row: TableCellInput seeds its draft
  // once, so an editor left open across prev/next would write row N's text
  // into row N+1. Row-scoping unmounts it on every row switch instead.
  const [editing, setEditing] = useState<{
    rowId: string;
    fieldId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const tickets = useQuery({
    queryKey: ["row-tickets", row?.id],
    enabled: open && row !== null,
    queryFn: () =>
      getRowTickets({
        organizationId: table.organizationId,
        tableId: table.id,
        rowId: row?.id ?? "",
      }),
  });

  if (!row) return null;
  const title = fields[0] ? String(row.values[fields[0].id] ?? "") : "";

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="sm" showCloseButton={false}>
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
              title={row.id}
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

        <SheetTitle className="text-xl font-semibold break-words">
          {title || t("navigation:tables.untitledRow")}
        </SheetTitle>

        <section className="flex flex-col gap-0.5" data-slot="row-fields">
          {fields.map((field) => (
            <div key={field.id} className="flex min-h-8 items-start gap-2">
              <span className="flex h-8 w-36 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <FieldTypeIcon type={field.type} />
                <span className="truncate">{field.name}</span>
              </span>
              {/* Key/value list: every value starts on one column, numbers too. */}
              <div className="flex min-h-8 min-w-0 flex-1 items-center rounded-md px-2 text-ui hover:bg-row-hover *:text-left!">
                <DataTableCellContent
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
                  onCommit={(value) => {
                    // The grid's commitCell clears only its own editing state.
                    setEditing(null);
                    onCommit(row, field, value);
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        {/* Explicit row↔ticket links (made from a ticket's "Included in").
            Ticket cells already show in the fields above, so an empty list
            would only contradict them: render it when there is something. */}
        {(tickets.data?.length ?? 0) > 0 && (
          <section className="flex flex-col gap-1 border-t pt-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t("navigation:tables.linkedTickets")}
            </h3>
            <ul className="flex flex-col">
              {tickets.data?.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    to="/dashboard/$organizationSlug/tickets/$ticketKey"
                    params={{ organizationSlug, ticketKey: ticket.key }}
                    className="flex h-8 items-center gap-2 rounded-md px-2 text-ui hover:bg-row-hover"
                  >
                    <span className="shrink-0 [&_svg]:size-3.5">
                      {getColumnIcon(ticket.taskStatus ?? "")}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {ticket.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {ticket.taskTitle ?? ticket.title}
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
            table={table}
            fields={fields}
            members={members}
            rowId={row.id}
          />
        </section>
      </SheetContent>
    </Sheet>
  );
}
