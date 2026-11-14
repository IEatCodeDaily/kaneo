import { HTTPException } from "hono/http-exception";
import * as v from "valibot";

export const FIELD_TYPES = [
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
  "link",
  "ticket",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * Physical column type per field type. Stored ids (select/user) are plain
 * text; display resolution happens client-side via field options.
 */
const PG_TYPES = {
  text: "text",
  longtext: "text",
  url: "text",
  email: "text",
  select: "text",
  user: "text",
  number: "numeric",
  percent: "numeric",
  currency: "numeric",
  date: "date",
  datetime: "timestamptz",
  checkbox: "boolean",
  multiselect: "jsonb",
  json: "jsonb",
  link: "jsonb",
  // Task ids; ownership is checked against the org in the controller, which
  // has the org context coerceValue lacks.
  ticket: "jsonb",
} as const satisfies Record<FieldType, string>;

export type PgType = (typeof PG_TYPES)[FieldType];

export function pgTypeFor(type: FieldType): PgType {
  return PG_TYPES[type];
}

/** Field types that get a btree index on their physical column (filters/group-by). */
const INDEXED_TYPES: ReadonlySet<FieldType> = new Set([
  "select",
  "user",
  "date",
  "datetime",
]);

export function isIndexedField(type: FieldType): boolean {
  return INDEXED_TYPES.has(type);
}

export function isNumericField(type: FieldType): boolean {
  return PG_TYPES[type] === "numeric";
}

const choiceSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  label: v.pipe(v.string(), v.minLength(1)),
  color: v.optional(v.string()),
});

const numericOptions = v.object({
  precision: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
  ),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
});

const multiChoices = v.object({
  choices: v.pipe(v.array(choiceSchema), v.minLength(1)),
});

/**
 * Valibot schema for the `options` payload of each field type. `required` is
 * accepted on EVERY type (the grid's field editor always offers it), so the
 * exported schema is the per-type schema intersected with the shared
 * `{required?}` object — and types with no options of their own still accept
 * `{required}` alone.
 */
const REQUIRED_ONLY = v.object({ required: v.optional(v.boolean()) });
// Plain types have no per-type schema to merge with, so unknown keys can be
// rejected outright; the intersect variant must stay loose or it would reject
// per-type keys (precision, choices, code, ...).
const REQUIRED_ONLY_STRICT = v.strictObject({
  required: v.optional(v.boolean()),
});

const FIELD_OPTIONS: Partial<Record<FieldType, v.GenericSchema>> = {
  select: multiChoices,
  multiselect: multiChoices,
  number: numericOptions,
  percent: numericOptions,
  currency: v.object({
    code: v.pipe(
      v.string(),
      v.regex(/^[a-zA-Z]{3}$/),
      v.transform((code) => code.toUpperCase()),
    ),
  }),
  user: v.object({ allowTeams: v.optional(v.boolean()) }),
  link: v.object({
    targetTableId: v.pipe(v.string(), v.minLength(1)),
  }),
};

export function fieldOptionsSchema(type: FieldType): v.GenericSchema {
  const base = FIELD_OPTIONS[type];
  return base ? v.intersect([base, REQUIRED_ONLY]) : REQUIRED_ONLY_STRICT;
}

export function isFieldType(type: string): type is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(type);
}

export type CoercibleField = {
  type: FieldType;
  options?: Record<string, unknown> | null;
};

// Declared function, not a const arrow: TS only narrows after never-returning
// declared functions — every typeof guard below depends on that narrowing.
function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function choiceIds(field: CoercibleField): Set<string> | null {
  const choices = field.options?.choices;
  if (!Array.isArray(choices)) return null;
  return new Set(
    choices.filter((choice) => typeof choice?.id === "string").map((c) => c.id),
  );
}

/**
 * Client value -> physical column value. Throws HTTP 400 on anything that
 * cannot be stored in the field's column type. null clears the cell.
 */
export function coerceValue(field: CoercibleField, value: unknown): unknown {
  if (value === null || value === undefined) {
    if (field.options?.required === true) {
      badRequest("This field is required");
    }
    return null;
  }

  switch (field.type) {
    case "number":
    case "percent":
    case "currency":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        badRequest(`Field type ${field.type} requires a finite number`);
      }
      return value;
    case "date":
      if (
        typeof value !== "string" ||
        !DATE_RE.test(value) ||
        Number.isNaN(Date.parse(value))
      ) {
        badRequest("date fields require a YYYY-MM-DD string");
      }
      return value;
    case "datetime":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        badRequest("datetime fields require an ISO 8601 timestamp");
      }
      return value;
    case "checkbox":
      if (typeof value !== "boolean") {
        badRequest("checkbox fields require a boolean");
      }
      return value;
    case "select": {
      if (typeof value !== "string") {
        badRequest("select fields require a choice id string");
      }
      const ids = choiceIds(field);
      if (ids && !ids.has(value)) {
        badRequest("Value is not one of the field choices");
      }
      return value;
    }
    case "multiselect": {
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      ) {
        badRequest("multiselect fields require an array of choice ids");
      }
      const ids = choiceIds(field);
      if (ids) {
        for (const item of value) {
          if (!ids.has(item)) {
            badRequest("Value is not one of the field choices");
          }
        }
      }
      return value;
    }
    case "user":
    case "text":
    case "longtext":
      if (typeof value !== "string") {
        badRequest(`Field type ${field.type} requires a string`);
      }
      return value;
    case "url":
      if (typeof value !== "string") {
        badRequest("url fields require a string");
      }
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("bad protocol");
        }
      } catch {
        badRequest("url fields require an http(s) URL");
      }
      return value;
    case "email":
      if (typeof value !== "string" || !EMAIL_RE.test(value)) {
        badRequest("email fields require a valid email address");
      }
      return value;
    case "json":
      if (typeof value === "string") {
        try {
          JSON.parse(value);
        } catch {
          badRequest("json fields require parseable JSON");
        }
      }
      return value;
    case "link":
    case "ticket":
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string")
      ) {
        badRequest(`${field.type} fields require an array of ids`);
      }
      return value;
    default: {
      const _exhaustive: never = field.type;
      badRequest(`Unsupported field type: ${String(_exhaustive)}`);
    }
  }
}
