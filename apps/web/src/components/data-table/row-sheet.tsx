import { Link2, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldTypeIcon } from "@/components/data-table/data-table-cells";
import { DataTableCellContent } from "@/components/data-table/data-table-editors";
import type { MemberOption } from "@/components/data-table/data-table-cells";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getRowTickets } from "@/fetchers/data-table/row-links";
import { cn } from "@/lib/cn";
import type { DataTable, DataTableField, DataTableRow } from "@/types/data-table";

/**
 * 480px row sheet (design v3 S4): one row's fields stacked, Row ID copy,
 * prev/next through the current view, and the tickets linked to this row.
 */
export function RowSheet({
  open,
  onOpenChange,
  table,
  row,
  fields,
  members,
  canEdit,
  onCommit,
  onPrev,
  onNext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: DataTable;
  row: DataTableRow | null;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  canEdit: boolean;
  onCommit: (row: DataTableRow, field: DataTableField, value: unknown) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{
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
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.prevRow")}
              onClick={onPrev}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("navigation:tables.nextRow")}
              onClick={onNext}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="flex-1" />
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
          </div>
          <SheetTitle className="truncate text-sm">
            {String(row.values[fields[0]?.id ?? ""] ?? row.id)}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("navigation:tables.rowSheetTitle")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex items-start gap-2 border-b px-4 py-2 last:border-b-0"
            >
              <span className="flex w-36 shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                <FieldTypeIcon type={field.type} />
                <span className="truncate">{field.name}</span>
              </span>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col justify-center py-0.5",
                  ["number", "percent", "currency"].includes(field.type) &&
                    "items-end text-right",
                )}
              >
                <DataTableCellContent
                  row={row}
                  field={field}
                  members={members}
                  canEdit={canEdit}
                  isEditing={editing?.fieldId === field.id}
                  onEditStart={() => setEditing({ fieldId: field.id })}
                  onEditEnd={() => setEditing(null)}
                  onCommit={(value) => onCommit(row, field, value)}
                />
              </div>
            </div>
          ))}

          <div className="mt-2 px-4 py-2">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Link2 className="size-3.5" />
              {t("navigation:tables.linkedTickets")}
            </p>
            {tickets.isLoading ? null : (tickets.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("navigation:tables.noLinkedTickets")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {tickets.data?.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex items-center gap-2 border-b py-1.5 text-xs last:border-b-0"
                  >
                    <a
                      href={ticket.url}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {ticket.taskTitle ?? ticket.taskId}
                    </a>
                    {ticket.taskStatus && (
                      <span className="shrink-0 rounded-sm bg-primary-soft px-1.5 py-0.5 text-muted-foreground">
                        {ticket.taskStatus}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
