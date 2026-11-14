import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import globalSearch from "@/fetchers/search/global-search";
import { getColumnIcon } from "@/lib/column";
import type { TicketRef } from "@/types/data-table";
import { asStringArray } from "./data-table-format";

/**
 * Ticket lookup for ticket cells: the API ships `tickets` (id → key/title/
 * status) next to every row page, and the grid provides it here so cells,
 * the row sheet and pickers resolve ids without their own fetches.
 */
type TicketContextValue = {
  organizationSlug: string;
  organizationId: string;
  tickets: Record<string, TicketRef>;
};

export const TicketLookupContext = createContext<TicketContextValue>({
  organizationSlug: "",
  organizationId: "",
  tickets: {},
});

function TicketChip({ ticket }: { ticket: TicketRef }) {
  const { organizationSlug } = useContext(TicketLookupContext);
  return (
    <Link
      to="/dashboard/$organizationSlug/tickets/$ticketKey"
      params={{ organizationSlug, ticketKey: ticket.key }}
      onClick={(event) => event.stopPropagation()}
      title={ticket.title}
      className="inline-flex h-5 min-w-0 max-w-full items-center gap-1.5 rounded-sm border px-1.5 text-xs hover:bg-accent"
    >
      <span className="shrink-0 [&_svg]:size-3">
        {getColumnIcon(ticket.status)}
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground">
        {ticket.key}
      </span>
      <span className="truncate">{ticket.title}</span>
    </Link>
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

type SearchHit = { id: string; key: string; title: string; status: string };

/** Picker: search the org's tickets, toggle links. Commits on every pick. */
export function TicketCellPicker({
  value,
  canEdit,
  onCommit,
  children,
}: {
  value: unknown;
  canEdit: boolean;
  onCommit: (value: unknown) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { organizationId, tickets } = useContext(TicketLookupContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const selected = asStringArray(value);

  useEffect(() => {
    if (!open || query.trim() === "") {
      setHits([]);
      return;
    }
    let cancelled = false;
    // ponytail: global search caps at 20 hits; a dedicated endpoint if users
    // need to browse beyond a query.
    const handle = setTimeout(() => {
      globalSearch({
        q: query.trim(),
        type: "tasks",
        organizationId,
        limit: 20,
      })
        .then((data) => {
          if (cancelled) return;
          // The route's response schema is loose; same cast as the palette.
          const results = (data.results ?? []) as Array<{
            id: string;
            type: string;
            title: string;
            boardSlug?: string;
            taskNumber?: number;
            status?: string;
          }>;
          setHits(
            results
              .filter((r) => r.type === "task" && r.boardSlug)
              .map((r) => ({
                id: r.id,
                key: `${(r.boardSlug ?? "").toUpperCase()}-${r.taskNumber ?? "?"}`,
                title: r.title,
                status: r.status ?? "",
              })),
          );
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, query, organizationId]);

  if (!canEdit) return <>{children}</>;

  const toggle = (id: string) =>
    onCommit(
      selected.includes(id)
        ? selected.filter((current) => current !== id)
        : [...selected, id],
    );
  const linked = selected
    .map((id) => tickets[id])
    .filter((ref): ref is TicketRef => Boolean(ref));

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
        {linked.length > 0 && (
          <div className="mb-1 flex flex-col border-b pb-1">
            {linked.map((ref) => (
              <button
                key={ref.id}
                type="button"
                onClick={() => toggle(ref.id)}
                className="flex h-7 items-center gap-2 rounded-sm px-2 text-left text-ui hover:bg-accent"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {ref.key}
                </span>
                <span className="min-w-0 flex-1 truncate">{ref.title}</span>
                <X
                  className="size-3.5 text-muted-foreground"
                  aria-label={t("navigation:tables.unlinkTicket")}
                />
              </button>
            ))}
          </div>
        )}
        <div role="listbox" className="flex max-h-64 flex-col overflow-y-auto">
          {hits
            .filter((hit) => !selected.includes(hit.id))
            .map((hit) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => toggle(hit.id)}
                className="flex h-7 items-center gap-2 rounded-sm px-2 text-left text-ui hover:bg-accent"
              >
                <span className="[&_svg]:size-3">
                  {getColumnIcon(hit.status)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {hit.key}
                </span>
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
              </button>
            ))}
        </div>
        {hits.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {query.trim() === ""
              ? t("navigation:tables.typeToSearchTickets")
              : t("navigation:tables.noTicketsFound")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
