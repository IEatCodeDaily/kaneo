import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  DataTableField,
  DataTableRow,
  TicketRef,
} from "@/types/data-table";

const tablePath = ({
  organizationId,
  tableId,
}: {
  organizationId: string;
  tableId: string;
}) =>
  `/data-table/organization/${encodeURIComponent(organizationId)}/${encodeURIComponent(tableId)}`;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return (await response.json()) as T;
};

export type RowTicket = {
  id: string;
  taskId: string;
  url: string;
  title: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
};

export const getRowTickets = ({
  organizationId,
  tableId,
  rowId,
}: {
  organizationId: string;
  tableId: string;
  rowId: string;
}) =>
  request<RowTicket[]>(
    `${tablePath({ organizationId, tableId })}/rows/${encodeURIComponent(rowId)}/tickets`,
  );

export const linkRowToTask = ({
  organizationId,
  tableId,
  rowId,
  taskId,
}: {
  organizationId: string;
  tableId: string;
  rowId: string;
  taskId: string;
}) =>
  request<{ success: boolean; alreadyLinked: boolean }>(
    `${tablePath({ organizationId, tableId })}/rows/${encodeURIComponent(rowId)}/tickets?taskId=${encodeURIComponent(taskId)}`,
    { method: "POST" },
  );

export const unlinkRowTask = ({
  organizationId,
  tableId,
  rowId,
  taskId,
}: {
  organizationId: string;
  tableId: string;
  rowId: string;
  taskId: string;
}) =>
  request<{ success: boolean }>(
    `${tablePath({ organizationId, tableId })}/rows/${encodeURIComponent(rowId)}/tickets?taskId=${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );

/** "Included in": rows that include a ticket (explicit link or ticket cell). */
export type TableRowGroup = {
  organizationSlug: string;
  tables: {
    tableId: string;
    tableName: string;
    icon: string | null;
    canEdit: boolean;
    fields: DataTableField[];
    rows: (DataTableRow & { linked: boolean })[];
    tickets: Record<string, TicketRef>;
  }[];
};

export const getRowsForTask = ({
  organizationId,
  taskId,
}: {
  organizationId: string;
  taskId: string;
}) =>
  request<TableRowGroup>(
    `/data-table/organization/${encodeURIComponent(organizationId)}/rows-for-ticket?taskId=${encodeURIComponent(taskId)}`,
  );
