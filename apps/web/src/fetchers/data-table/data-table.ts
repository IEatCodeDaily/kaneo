import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  CreateDataTableFieldInput,
  CreateDataTableInput,
  CreateDataTableRowInput,
  DataTable,
  DataTableField,
  DataTableFieldTarget,
  DataTableRow,
  DataTableRowTarget,
  DataTableSummary,
  DataTableTarget,
  UpdateDataTableFieldInput,
  UpdateDataTableInput,
  UpsertDataTableCellInput,
} from "@/types/data-table";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Data table request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const base = (organizationId: string) =>
  `/data-table/organization/${encodeURIComponent(organizationId)}`;

const tablePath = ({ organizationId, tableId }: DataTableTarget) =>
  `${base(organizationId)}/${encodeURIComponent(tableId)}`;

export const getDataTables = (organizationId: string) =>
  request<DataTableSummary[]>(base(organizationId));

export const getDataTable = (tableId: string, organizationId: string) =>
  request<DataTable>(`${base(organizationId)}/${encodeURIComponent(tableId)}`);

/** Subsequent row pages for the grid's Load-more (server caps at 1000/page). */
export const getTableRowPage = (
  tableId: string,
  organizationId: string,
  offset: number,
) =>
  request<DataTable>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}?offset=${offset}`,
  );

export const createDataTable = ({
  organizationId,
  name,
  icon,
}: CreateDataTableInput) =>
  request<DataTableSummary>(base(organizationId), {
    method: "POST",
    body: JSON.stringify({ name, ...(icon ? { icon } : {}) }),
  });

export const updateDataTable = ({
  organizationId,
  tableId,
  name,
  icon,
}: UpdateDataTableInput) =>
  request<DataTableSummary>(tablePath({ organizationId, tableId }), {
    method: "PUT",
    body: JSON.stringify({
      ...(name !== undefined ? { name } : {}),
      ...(icon !== undefined ? { icon } : {}),
    }),
  });

/** Soft delete — the summary comes back with `deletedAt` set. */
export const deleteDataTable = ({ organizationId, tableId }: DataTableTarget) =>
  request<DataTableSummary>(tablePath({ organizationId, tableId }), {
    method: "DELETE",
  });

export const restoreDataTable = ({
  organizationId,
  tableId,
}: DataTableTarget) =>
  request<DataTableSummary>(
    `${tablePath({ organizationId, tableId })}/restore`,
    { method: "POST" },
  );

export const purgeDataTable = ({ organizationId, tableId }: DataTableTarget) =>
  request<{ success: true }>(
    `${tablePath({ organizationId, tableId })}/purge`,
    { method: "POST" },
  );

export const createDataTableField = ({
  organizationId,
  tableId,
  name,
  type,
  options,
  position,
}: CreateDataTableFieldInput) =>
  request<DataTableField>(`${tablePath({ organizationId, tableId })}/fields`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type,
      ...(options ? { options } : {}),
      ...(position !== undefined ? { position } : {}),
    }),
  });

export const updateDataTableField = ({
  organizationId,
  tableId,
  fieldId,
  name,
  type,
  options,
}: UpdateDataTableFieldInput) =>
  request<DataTableField>(
    `${tablePath({ organizationId, tableId })}/fields/${encodeURIComponent(fieldId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(options !== undefined ? { options } : {}),
      }),
    },
  );

export const deleteDataTableField = ({
  organizationId,
  tableId,
  fieldId,
}: DataTableFieldTarget) =>
  request<{ success: true }>(
    `${tablePath({ organizationId, tableId })}/fields/${encodeURIComponent(fieldId)}`,
    { method: "DELETE" },
  );

export const createDataTableRow = ({
  organizationId,
  tableId,
  values,
}: CreateDataTableRowInput) =>
  request<DataTableRow>(`${tablePath({ organizationId, tableId })}/rows`, {
    method: "POST",
    body: JSON.stringify(values ? { values } : {}),
  });

export const deleteDataTableRow = ({
  organizationId,
  tableId,
  rowId,
}: DataTableRowTarget) =>
  request<{ success: true }>(
    `${tablePath({ organizationId, tableId })}/rows/${encodeURIComponent(rowId)}`,
    { method: "DELETE" },
  );

export const upsertDataTableCell = ({
  organizationId,
  tableId,
  rowId,
  fieldId,
  value,
}: UpsertDataTableCellInput) =>
  request<DataTableRow>(
    `${tablePath({ organizationId, tableId })}/rows/${encodeURIComponent(rowId)}/cells/${encodeURIComponent(fieldId)}`,
    { method: "PUT", body: JSON.stringify({ value }) },
  );
