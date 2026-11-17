import type {
  DataTableField,
  DataTableRow,
  SelectChoice,
  TicketRef,
} from "@/types/data-table";
import { asBool, asNumber, asString, fieldValue } from "./data-table-format";

type MemberNameLookup = Map<string, string>;

/** RFC4180: quote fields containing separators/quotes/newlines, escape as "". */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Cell value as data (not display formatting) — re-importable. */
function cellText(
  field: DataTableField,
  raw: unknown,
  choices: Map<string, SelectChoice>,
  memberNames: MemberNameLookup,
  tickets: Record<string, TicketRef> = {},
): string {
  if (raw === null || raw === undefined || raw === "") return "";
  switch (field.type) {
    case "checkbox":
      return asBool(raw) ? "true" : "false";
    case "number":
    case "percent":
    case "currency": {
      const n = asNumber(raw);
      return n === null ? "" : String(n);
    }
    case "select": {
      const id = asString(raw);
      return choices.get(id)?.label ?? "";
    }
    case "multiselect": {
      const ids = Array.isArray(raw) ? raw.map(asString) : [];
      return ids
        .map((id) => choices.get(id)?.label ?? "")
        .filter(Boolean)
        .join(", ");
    }
    case "user": {
      const id = asString(raw);
      return memberNames.get(id) ?? "";
    }
    case "json":
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    case "ticket":
      // Keys, not ids: readable, and what a human types back in.
      return (Array.isArray(raw) ? raw : [])
        .map((id) => tickets[asString(id)]?.key ?? "")
        .filter(Boolean)
        .join(", ");
    default:
      return asString(raw);
  }
}

/**
 * Search matches what a cell reads as (choice labels, member names, ticket
 * keys, numbers), not only text fields: the CSV text is exactly that.
 */
export function rowMatchesSearch(
  row: DataTableRow,
  fields: DataTableField[],
  query: string,
  choices: Map<string, SelectChoice>,
  memberNames: MemberNameLookup,
  tickets: Record<string, TicketRef> = {},
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) =>
    cellText(field, fieldValue(row, field), choices, memberNames, tickets)
      .toLowerCase()
      .includes(needle),
  );
}

export function csvSerialize(
  fields: DataTableField[],
  rows: DataTableRow[],
  choices: Map<string, SelectChoice>,
  memberNames: MemberNameLookup,
  tickets: Record<string, TicketRef> = {},
): string {
  const exportFields = fields.filter((field) => !field.system);
  const lines = [exportFields.map((field) => csvCell(field.name)).join(",")];
  for (const row of rows) {
    lines.push(
      exportFields
        .map((field) =>
          csvCell(
            cellText(
              field,
              fieldValue(row, field),
              choices,
              memberNames,
              tickets,
            ),
          ),
        )
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** Minimal RFC4180 parser: quoted cells, "" escapes, CRLF/LF rows. */
export function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
