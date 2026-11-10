import type {
  DataTableField,
  DataTableFieldOptions,
  DataTableFieldType,
  DataTableRow,
  SelectChoice,
} from "@/types/data-table";

/** Types a field can be switched to. `link` is read-only v1, never offered. */
export const EDITABLE_FIELD_TYPES: DataTableFieldType[] = [
  "text",
  "longtext",
  "number",
  "percent",
  "currency",
  "date",
  "datetime",
  "select",
  "multiselect",
  "checkbox",
  "user",
  "url",
  "email",
  "json",
];

export const FIELD_TYPE_LABEL_KEYS: Record<DataTableFieldType, string> = {
  text: "navigation:tables.typeText",
  longtext: "navigation:tables.typeLongtext",
  number: "navigation:tables.typeNumber",
  percent: "navigation:tables.typePercent",
  currency: "navigation:tables.typeCurrency",
  date: "navigation:tables.typeDate",
  datetime: "navigation:tables.typeDatetime",
  select: "navigation:tables.typeSelect",
  multiselect: "navigation:tables.typeMultiselect",
  checkbox: "navigation:tables.typeCheckbox",
  user: "navigation:tables.typeUser",
  url: "navigation:tables.typeUrl",
  email: "navigation:tables.typeEmail",
  json: "navigation:tables.typeJson",
  link: "navigation:tables.typeLink",
};

export const ROW_NUMBER_COLUMN_WIDTH = 44;

const FIELD_WIDTHS: Record<DataTableFieldType, number> = {
  text: 220,
  longtext: 260,
  number: 110,
  percent: 110,
  currency: 140,
  date: 130,
  datetime: 170,
  select: 170,
  multiselect: 220,
  checkbox: 90,
  user: 180,
  url: 200,
  email: 200,
  json: 220,
  link: 110,
};

export const fieldWidth = (type: DataTableFieldType) => FIELD_WIDTHS[type];

export function sortedFields(fields: DataTableField[]) {
  return [...fields].sort((a, b) => a.position - b.position);
}

export function sortedRows(rows: DataTableRow[]) {
  return [...rows].sort((a, b) => a.position - b.position);
}

// ── options accessors ──────────────────────────────────────────────────────

export function fieldChoices(field: DataTableField): SelectChoice[] {
  return field.options?.choices ?? [];
}

export function fieldPrecision(field: DataTableField): number {
  const precision = field.options?.precision;
  return typeof precision === "number" && precision >= 0
    ? Math.min(precision, 8)
    : 0;
}

export function fieldBounds(field: DataTableField) {
  return {
    min: field.options?.min,
    max: field.options?.max,
  };
}

export function fieldIsRequired(field: DataTableField): boolean {
  return field.options?.required === true;
}

// ── value coercion (cells are jsonb — never trust the shape) ───────────────

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBool(value: unknown): boolean {
  return value === true;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

// ── formatting ─────────────────────────────────────────────────────────────

const dateOnlyFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 'YYYY-MM-DD' parsed in local time so the rendered day never shifts. */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateValue(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = parseDateOnly(raw.slice(0, 10));
  return date ? dateOnlyFormat.format(date) : raw;
}

export function formatDateTimeValue(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : dateTimeFormat.format(date);
}

export function formatNumberValue(value: unknown, precision: number): string {
  const parsed = asNumber(value);
  if (parsed === null) return "";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function formatCurrencyValue(value: unknown, field: DataTableField) {
  const parsed = asNumber(value);
  if (parsed === null) return "";
  const amount = parsed.toLocaleString(undefined, {
    maximumFractionDigits: fieldPrecision(field),
  });
  const code = field.options?.code;
  return code ? `${amount} ${code}` : amount;
}

// ── validation (editors refuse to commit while invalid) ────────────────────

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** True when `raw` is a valid number within the field's min/max/precision. */
export function isValidNumberInput(raw: string, field: DataTableField) {
  if (raw.trim() === "") return false;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  const { min, max } = fieldBounds(field);
  if (min !== undefined && parsed < min) return false;
  if (max !== undefined && parsed > max) return false;
  const precision = fieldPrecision(field);
  const decimals = raw.split(".")[1];
  return !decimals || decimals.length <= precision;
}

/** For JSON cells: null is valid (clears the cell). */
export function parseJsonValue(raw: string) {
  if (raw.trim() === "") return { ok: true as const, value: null };
  try {
    return { ok: true as const, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false as const };
  }
}

// ── client-side sort / search / filter ─────────────────────────────────────

export type SortDir = "asc" | "desc";
export type ColumnSort = { fieldId: string; dir: SortDir };

const TEXT_SEARCH_TYPES: DataTableFieldType[] = [
  "text",
  "longtext",
  "url",
  "email",
];

export function rowMatchesSearch(
  row: DataTableRow,
  fields: DataTableField[],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some(
    (field) =>
      TEXT_SEARCH_TYPES.includes(field.type) &&
      asString(row.values[field.id]).toLowerCase().includes(needle),
  );
}

export type DataTableFilter = (
  | { fieldId: string; contains: string }
  | { fieldId: string; min: string; max: string }
  | { fieldId: string; from: string; to: string }
  | { fieldId: string; choiceId: string }
  | { fieldId: string; checked: "any" | "true" | "false" }
) & {
  /** Stable identity for React keys and in-place updates. */
  id: string;
};

export function defaultFilterFor(field: DataTableField): DataTableFilter {
  const inner = (() => {
    switch (field.type) {
      case "number":
      case "percent":
      case "currency":
        return { fieldId: field.id, min: "", max: "" };
      case "date":
      case "datetime":
        return { fieldId: field.id, from: "", to: "" };
      case "checkbox":
        return { fieldId: field.id, checked: "any" as const };
      case "select":
      case "multiselect":
      case "user":
        return { fieldId: field.id, choiceId: "" };
      default:
        return { fieldId: field.id, contains: "" };
    }
  })();
  return { id: crypto.randomUUID(), ...inner };
}

function filterMatches(
  row: DataTableRow,
  field: DataTableField,
  filter: DataTableFilter,
): boolean {
  const raw = row.values[field.id];
  switch (field.type) {
    case "number":
    case "percent":
    case "currency": {
      const { min, max } = filter as { min: string; max: string };
      const parsed = asNumber(raw);
      if (min.trim() !== "" || max.trim() !== "") {
        if (parsed === null) return false;
        if (min.trim() !== "" && parsed < Number(min)) return false;
        if (max.trim() !== "" && parsed > Number(max)) return false;
      }
      return true;
    }
    case "date":
    case "datetime": {
      const { from, to } = filter as { from: string; to: string };
      const value = asString(raw);
      if (from !== "" || to !== "") {
        if (!value) return false;
        if (from !== "" && value < from) return false;
        if (to !== "") {
          // Date-only "to" is inclusive through the whole day.
          const bound = field.type === "date" ? `${to}T23:59:59.999` : to;
          if (value > bound) return false;
        }
      }
      return true;
    }
    case "checkbox": {
      const { checked } = filter as { checked: "any" | "true" | "false" };
      if (checked === "any") return true;
      return asBool(raw) === (checked === "true");
    }
    case "select":
    case "user": {
      const { choiceId } = filter as { choiceId: string };
      if (choiceId === "") return true;
      if (choiceId === "__empty__") return asString(raw) === "";
      return asString(raw) === choiceId;
    }
    case "multiselect": {
      const { choiceId } = filter as { choiceId: string };
      if (choiceId === "") return true;
      const selected = asStringArray(raw);
      if (choiceId === "__empty__") return selected.length === 0;
      return selected.includes(choiceId);
    }
    default: {
      const { contains } = filter as { contains: string };
      if (contains.trim() === "") return true;
      return asString(raw)
        .toLowerCase()
        .includes(contains.trim().toLowerCase());
    }
  }
}

/** fieldsById is built once by the caller — one Map per grid, not per row. */
export function rowMatchesFilters(
  row: DataTableRow,
  fieldsById: Map<string, DataTableField>,
  filters: DataTableFilter[],
): boolean {
  return filters.every((filter) => {
    const field = fieldsById.get(filter.fieldId);
    return field ? filterMatches(row, field, filter) : true;
  });
}

/** Comparable projection for one column; null sorts last in both dirs. */
export function sortValue(
  row: DataTableRow,
  field: DataTableField,
): string | number | null {
  const raw = row.values[field.id];
  switch (field.type) {
    case "number":
    case "percent":
    case "currency":
      return asNumber(raw);
    case "date":
    case "datetime": {
      const value = asString(raw);
      if (!value) return null;
      const time = Date.parse(
        field.type === "date" ? `${value}T00:00:00` : value,
      );
      return Number.isNaN(time) ? null : time;
    }
    case "checkbox":
      return asBool(raw) ? 1 : 0;
    case "select": {
      // Sort by choice label, not by choice id.
      const id = asString(raw);
      const choice = fieldChoices(field).find((item) => item.id === id);
      return choice?.label ?? id;
    }
    default:
      return asString(raw);
  }
}

export function sortRows(
  rows: DataTableRow[],
  fields: DataTableField[],
  sort: ColumnSort | null,
): DataTableRow[] {
  if (!sort) return rows;
  const field = fields.find((item) => item.id === sort.fieldId);
  if (!field) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, field);
    const right = sortValue(b, field);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * factor;
    }
    return (
      asString(left).localeCompare(asString(right), undefined, {
        numeric: true,
      }) * factor
    );
  });
}

// ── density preference (localStorage, readListGroupBy pattern) ─────────────

export type Density = "compact" | "comfortable";
export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 36,
  comfortable: 44,
};

const DENSITY_KEY = "kaneo-table-density";

export function readDensity(): Density {
  try {
    const value = window.localStorage.getItem(DENSITY_KEY);
    return value === "comfortable" ? "comfortable" : "compact";
  } catch {
    return "compact";
  }
}

export function writeDensity(value: Density): void {
  try {
    window.localStorage.setItem(DENSITY_KEY, value);
  } catch {
    // Storage can be unavailable in hardened/private contexts; state works.
  }
}

// ── misc ───────────────────────────────────────────────────────────────────

export function makeChoiceId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function optionsForType(
  type: DataTableFieldType,
  options: DataTableFieldOptions | null | undefined,
): DataTableFieldOptions {
  const base: DataTableFieldOptions =
    type === "select" || type === "multiselect"
      ? { choices: options?.choices ?? [] }
      : {};
  if (options?.required) base.required = true;
  if (type === "number" || type === "percent") {
    if (typeof options?.precision === "number") {
      base.precision = options.precision;
    }
    if (typeof options?.min === "number") base.min = options.min;
    if (typeof options?.max === "number") base.max = options.max;
  }
  if (type === "currency" && options?.code) base.code = options.code;
  if (type === "user" && options?.allowTeams) base.allowTeams = true;
  if (type === "link" && options?.targetTableId) {
    base.targetTableId = options.targetTableId;
  }
  return base;
}
