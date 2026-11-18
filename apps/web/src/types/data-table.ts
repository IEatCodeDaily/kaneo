export const DATA_TABLE_FIELD_TYPES = [
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

export type DataTableFieldType = (typeof DATA_TABLE_FIELD_TYPES)[number];

export type SelectChoice = {
  id: string;
  label: string;
  color: string;
};

/**
 * Wire shape of `data_table_field.options`. One loose bag instead of a
 * discriminated union: only the keys relevant to the field's type are read,
 * and the API treats options as an opaque jsonb object.
 */
export type DataTableFieldOptions = {
  choices?: SelectChoice[];
  precision?: number;
  min?: number;
  max?: number;
  code?: string;
  allowTeams?: boolean;
  targetTableId?: string;
  relationId?: string;
  inverseFieldId?: string;
  side?: "source" | "target";
  localMax?: "one" | "many";
  inverseMax?: "one" | "many";
  cardinality?: "many-to-one" | "one-to-many" | "many-to-many" | "one-to-one";
  inverseName?: string;
  unavailable?: boolean;
  /** ticket: restrict to these boards (absent/empty = any board). */
  boardIds?: string[];
  /** ticket: false = one ticket per cell (absent = many). */
  multiple?: boolean;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
};

export type DataTableField = {
  /** Client-only virtual column, never sent to field mutations. */
  system?: true;
  id: string;
  tableId: string;
  name: string;
  type: DataTableFieldType;
  options: DataTableFieldOptions | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type LinkedRecord = { id: string; label: string; deleted?: boolean };
export type LinkValue = {
  kind: "link";
  status: "ok" | "unavailable";
  records: LinkedRecord[];
  total: number | null;
  hasMore: boolean;
  version: string | null;
};

export type DataTableRow = {
  id: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Optional for retained pre-migration snapshots and browser caches. */
  createdBy?: string | null;
  updatedBy?: string | null;
  values: Record<string, unknown>;
};

export type DataTableSummary = {
  canEdit?: boolean;
  id: string;
  organizationId: string;
  name: string;
  icon: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Resolved ticket for a ticket cell (the API ships these beside rows). */
export type TicketRef = {
  id: string;
  key: string;
  title: string;
  status: string;
  boardId: string;
  boardSlug: string;
};

/** One table/row history entry (who created / edited / deleted what). */
export type TableActivity = {
  id: string;
  type:
    | "row_created"
    | "row_deleted"
    | "cell_updated"
    | "link_added"
    | "link_removed"
    | "links_migrated"
    | "field_created"
    | "field_updated"
    | "field_deleted"
    | "ticket_linked"
    | "ticket_unlinked"
    | "comment_added"
    | "field_reverted"
    | "table_created"
    | "table_updated"
    | "table_deleted"
    | "table_restored"
    | "baseline";
  rowId: string | null;
  fieldId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
};

export type DataTable = DataTableSummary & {
  fields: DataTableField[];
  rows: DataTableRow[];
  total: number;
  tickets?: Record<string, TicketRef>;
};

export type {
  FilterCondition,
  FilterGroup,
  FilterOperator,
} from "../../../api/src/data-table/filter-expression";

import type { FilterGroup } from "../../../api/src/data-table/filter-expression";

export type TableRowQuery = {
  search?: string;
  includeSystem?: boolean;
  filters?:
    | FilterGroup
    | ({ fieldId: string } & (
        | { contains: string }
        | { min: string; max: string }
        | { from: string; to: string }
        | { choiceId: string }
        | { checked: "any" | "true" | "false" }
      ))[];
  sort?:
    | { fieldId: string; dir: "asc" | "desc" }
    | { fieldId: string; dir: "asc" | "desc" }[]
    | null;
  groupFieldId?: string | null;
  summaries?: Record<
    string,
    "none" | "sum" | "avg" | "min" | "max" | "filled" | "empty" | "checked"
  >;
  limit?: number;
  offset?: number;
};
export type TableRowQueryResult = {
  rows: DataTableRow[];
  total: number;
  tableTotal: number;
  summaries: Record<string, number | null>;
  groups: {
    key: string;
    label: string;
    total: number;
    [fieldId: string]: string | number | null;
  }[];
  tickets: Record<string, TicketRef>;
};

export type CreateDataTableInput = {
  organizationId: string;
  name: string;
  icon?: string;
};

export type UpdateDataTableInput = DataTableTarget & {
  name?: string;
  icon?: string;
};

export type DataTableTarget = {
  organizationId: string;
  tableId: string;
};

export type CreateDataTableFieldInput = DataTableTarget & {
  name: string;
  type: DataTableFieldType;
  options?: DataTableFieldOptions;
  position?: number;
};

export type UpdateDataTableFieldInput = DataTableTarget & {
  fieldId: string;
  name?: string;
  type?: DataTableFieldType;
  options?: DataTableFieldOptions | null;
};

export type DataTableFieldTarget = DataTableTarget & {
  fieldId: string;
};

export type DataTableRowTarget = DataTableTarget & {
  rowId: string;
};

export type CreateDataTableRowInput = DataTableTarget & {
  values?: Record<string, unknown>;
};

export type UpsertDataTableCellInput = DataTableRowTarget & {
  fieldId: string;
  value: unknown;
};
