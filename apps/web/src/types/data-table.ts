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
  required?: boolean;
};

export type DataTableField = {
  id: string;
  tableId: string;
  name: string;
  type: DataTableFieldType;
  options: DataTableFieldOptions | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type DataTableRow = {
  id: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

export type DataTableSummary = {
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
  boardSlug: string;
};

export type DataTable = DataTableSummary & {
  fields: DataTableField[];
  rows: DataTableRow[];
  total: number;
  tickets?: Record<string, TicketRef>;
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
