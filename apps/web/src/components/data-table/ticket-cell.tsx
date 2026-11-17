import { Link } from "@tanstack/react-router";
import { Check, Search, X } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getTicketOptions } from "@/fetchers/data-table/data-table";
import { cn } from "@/lib/cn";
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
      data-ticket-chip
      title={ticket.title}
      className="inline-flex h-5 min-w-0 max-w-full flex-1 items-center gap-1.5 overflow-hidden rounded-sm border bg-background px-1.5 text-xs"
    >
      <span className="shrink-0 [&_svg]:size-3">
        {getColumnIcon(ticket.status)}
      </span>
      <Link
        to="/dashboard/$organizationSlug/tickets/$ticketKey"
        params={{ organizationSlug, ticketKey: ticket.key }}
        onClick={(event) => event.stopPropagation()}
        className="min-w-0 max-w-full shrink truncate whitespace-nowrap font-mono text-muted-foreground hover:text-foreground hover:underline"
      >
        {ticket.key}
      </Link>
      <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
    </span>
  );
}

/** Grid shows one clipped chip plus a count; wrap/expanded views wrap all. */
export function TicketCellView({
  value,
  expanded = false,
  wrapLines = false,
}: {
  value: unknown;
  expanded?: boolean;
  /** Row-height wrap mode: show every chip, wrapped, instead of 1 + count. */
  wrapLines?: boolean;
}) {
  const { tickets } = useContext(TicketLookupContext);
  const refs = asStringArray(value)
    .map((id) => tickets[id])
    .filter((ref): ref is TicketRef => Boolean(ref));
  if (refs.length === 0) return null;
  const wrap = expanded || wrapLines;
  return (
    <span
      className={cn(
        "flex w-full min-w-0 items-center gap-1",
        wrap ? "flex-wrap [&>[data-ticket-chip]]:flex-none" : "overflow-hidden",
      )}
    >
      {(wrap ? refs : refs.slice(0, 1)).map((ref) => (
        <TicketChip key={ref.id} ticket={ref} />
      ))}
      {!wrap && refs.length > 1 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          +{refs.length - 1}
        </span>
      )}
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
  const context = useContext(TicketLookupContext);
  const { organizationId, tableId, tickets } = context;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<TicketRef[]>([]);
  // Retain selected search hits until the row refetch supplies the lookup.
  const [picked, setPicked] = useState<Record<string, TicketRef>>({});
  const selected = asStringArray(value);
  const multiple = field.options?.multiple !== false;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      getTicketOptions(
        { organizationId, tableId },
        field.id,
        query.trim(),
        field.id === "draft" ? field.options?.boardIds : undefined,
      )
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
  }, [open, query, organizationId, tableId, field.id, field.options?.boardIds]);

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
    .map((id) => tickets[id] ?? picked[id] ?? hits.find((hit) => hit.id === id))
    .filter((ref): ref is TicketRef => Boolean(ref));
  const options = hits.filter((hit) => !selected.includes(hit.id));

  const row = (ref: TicketRef, isSelected: boolean) => (
    <Button
      variant="ghost"
      size="sm"
      key={ref.id}
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => {
        setPicked((current) => ({ ...current, [ref.id]: ref }));
        pick(ref.id);
      }}
      className="group/opt min-h-8 shrink-0 justify-start gap-2 px-2 text-left aria-selected:bg-secondary"
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
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild nativeButton={false}>
        <Button
          variant="ghost"
          size="sm"
          render={<div />}
          role="button"
          tabIndex={0}
          aria-label={t("navigation:tables.linkTicket")}
          className="h-auto min-w-0 flex-1 justify-start whitespace-normal border-0 px-0 text-left sm:h-auto"
        >
          <TicketLookupContext.Provider
            value={{ ...context, tickets: { ...tickets, ...picked } }}
          >
            {children}
          </TicketLookupContext.Provider>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        inset="panel"
        className="h-auto w-80 max-h-[70dvh] [&_[data-slot=popover-viewport]]:flex [&_[data-slot=popover-viewport]]:h-auto [&_[data-slot=popover-viewport]]:flex-col [&_[data-slot=popover-viewport]]:gap-2"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative mb-1 flex items-center">
          <Search className="absolute left-2 size-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            className="h-7 text-ui [&_input]:pl-7"
            placeholder={t("navigation:tables.searchTickets")}
            aria-label={t("navigation:tables.searchTickets")}
          />
        </div>
        <div
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className="flex min-h-0 max-h-[min(18rem,60dvh)] flex-col gap-1 overflow-y-auto"
        >
          {linked.map((ref) => row(ref, true))}
          {selected
            .filter((id) => !linked.some((ref) => ref.id === id))
            .map((id) => (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                role="option"
                aria-selected
                className="min-h-8 shrink-0 justify-start gap-2 px-2"
                onClick={() =>
                  onCommit(selected.filter((current) => current !== id))
                }
              >
                {t("navigation:tables.unknownValue")}
                <X className="size-3.5" />
              </Button>
            ))}

          {options.length > 0 && linked.length > 0 && (
            <hr className="my-1 border-border" />
          )}
          {options.map((ref) => row(ref, false))}
        </div>
        {selected.length === 0 && options.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t("navigation:tables.noTicketsFound")}
          </p>
        )}
        {!multiple && selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              onCommit([]);
              setOpen(false);
            }}
            className="min-h-8 w-full shrink-0 justify-start border-t px-2 text-left text-muted-foreground"
          >
            {t("navigation:tables.clearTicket")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
