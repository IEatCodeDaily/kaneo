import { Link } from "@tanstack/react-router";
import { Check, Search, X } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getTicketOptions } from "@/fetchers/data-table/data-table";
import { getColumnIcon } from "@/lib/column";
import type { DataTableField, TicketRef } from "@/types/data-table";
import { asStringArray } from "./data-table-format";

/**
 * Ticket lookup for ticket cells: the API ships `tickets` (id → key/title/
 * status) next to every row page, and the grid provides it here so cells,
 * the row sheet and pickers resolve ids without their own fetches.
 */
type TicketContextValue = {
  organizationSlug: string;
  organizationId: string;
  tableId: string;
  tickets: Record<string, TicketRef>;
};

export const TicketLookupContext = createContext<TicketContextValue>({
  organizationSlug: "",
  organizationId: "",
  tableId: "",
  tickets: {},
});

/**
 * Only the KEY navigates to the ticket; the rest of the chip is inert so a
 * click there falls through to the cell's picker (swap / unlink).
 */
function TicketChip({ ticket }: { ticket: TicketRef }) {
  const { organizationSlug } = useContext(TicketLookupContext);
  return (
    <span
      title={ticket.title}
      className="inline-flex h-5 min-w-0 max-w-full items-center gap-1.5 rounded-sm border px-1.5 text-xs"
    >
      <span className="shrink-0 [&_svg]:size-3">
        {getColumnIcon(ticket.status)}
      </span>
      <Link
        to="/dashboard/$organizationSlug/tickets/$ticketKey"
        params={{ organizationSlug, ticketKey: ticket.key }}
        onClick={(event) => event.stopPropagation()}
        className="shrink-0 whitespace-nowrap font-mono text-muted-foreground hover:text-foreground hover:underline"
      >
        {ticket.key}
      </Link>
      <span className="truncate">{ticket.title}</span>
    </span>
  );
}

/** Read view: one chip per linked ticket; unresolved ids (deleted) drop out. */
export function TicketCellView({ value }: { value: unknown }) {
  const { tickets } = useContext(TicketLookupContext);
  const refs = asStringArray(value)
    .map((id) => tickets[id])
    .filter((ref): ref is TicketRef => Boolean(ref));
  if (refs.length === 0) return null;
  return (
    <span className="flex w-full min-w-0 items-center gap-1 overflow-hidden">
      {refs.map((ref) => (
        <TicketChip key={ref.id} ticket={ref} />
      ))}
    </span>
  );
}

/**
 * Picker for one ticket field. Options come from the field's own endpoint, so
 * the board restriction is enforced server-side; an empty query browses the
 * newest tickets. Single-ticket fields swap on pick; many-ticket fields
 * toggle, with the current links listed first (click to unlink).
 */
export function TicketCellPicker({
  field,
  value,
  canEdit,
  onCommit,
  children,
}: {
  field: DataTableField;
  value: unknown;
  canEdit: boolean;
  onCommit: (value: unknown) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { organizationId, tableId, tickets } = useContext(TicketLookupContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TicketRef[]>([]);
  const selected = asStringArray(value);
  const multiple = field.options?.multiple !== false;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      getTicketOptions({ organizationId, tableId }, field.id, query.trim())
        .then((refs) => {
          if (!cancelled) setHits(refs);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, organizationId, tableId, field.id]);

  if (!canEdit) return <>{children}</>;

  const pick = (id: string) => {
    if (!multiple) {
      // Swap: the pick replaces whatever was there; re-picking clears.
      onCommit(selected[0] === id ? [] : [id]);
      setOpen(false);
      return;
    }
    onCommit(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  };
  const linked = selected
    .map((id) => tickets[id])
    .filter((ref): ref is TicketRef => Boolean(ref));
  const options = hits.filter((hit) => !selected.includes(hit.id));

  const row = (ref: TicketRef, isSelected: boolean) => (
    <button
      key={ref.id}
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => pick(ref.id)}
      className="group/opt flex h-7 items-center gap-2 rounded-sm px-2 text-left text-ui hover:bg-accent aria-selected:bg-secondary"
    >
      <span className="shrink-0 [&_svg]:size-3">
        {getColumnIcon(ref.status)}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {ref.key}
      </span>
      <span className="min-w-0 flex-1 truncate">{ref.title}</span>
      {isSelected &&
        (multiple ? (
          <X
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-label={t("navigation:tables.unlinkTicket")}
          />
        ) : (
          <Check className="size-3.5 shrink-0 text-muted-foreground" />
        ))}
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("navigation:tables.linkTicket")}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" align="start">
        <div className="relative mb-1 flex items-center">
          <Search className="absolute left-2 size-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            className="h-7 pl-7 text-ui"
            placeholder={t("navigation:tables.searchTickets")}
            aria-label={t("navigation:tables.searchTickets")}
          />
        </div>
        <div
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className="flex max-h-72 flex-col overflow-y-auto"
        >
          {linked.map((ref) => row(ref, true))}

          {options.length > 0 && linked.length > 0 && (
            <hr className="my-1 border-border" />
          )}
          {options.map((ref) => row(ref, false))}
        </div>
        {linked.length === 0 && options.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t("navigation:tables.noTicketsFound")}
          </p>
        )}
        {!multiple && linked.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onCommit([]);
              setOpen(false);
            }}
            className="mt-1 flex h-7 w-full items-center rounded-sm border-t px-2 text-left text-ui text-muted-foreground hover:bg-accent"
          >
            {t("navigation:tables.clearTicket")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
