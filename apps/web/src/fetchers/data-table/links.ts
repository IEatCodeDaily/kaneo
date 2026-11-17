import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
  LinkedRecord,
} from "@/types/data-table";
export type LinkOptions = {
  records: LinkedRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  canLink: boolean;
  canCreate: boolean;
  fields: DataTableField[];
  targetTableId: string;
  localMax: "one" | "many";
};
export type LinkPage = {
  records: LinkedRecord[];
  total: number;
  hasMore: boolean;
  nextCursor: number | null;
  version: string;
};
export async function linkRequest<T>(
  organizationId: string,
  tableId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    getApiUrl(
      `/data-table/organization/${encodeURIComponent(organizationId)}/${encodeURIComponent(tableId)}${path}`,
    ),
    {
      credentials: "include",
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    },
  );
  if (!response.ok)
    throw new Error((await response.text()) || "Relationship unavailable");
  return response.json();
}
export const getLinkOptions = (
  org: string,
  table: string,
  field: string,
  query: string,
  cursor = "",
) =>
  linkRequest<LinkOptions>(
    org,
    table,
    `/fields/${encodeURIComponent(field)}/link-options?q=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
export const getLinkedRecords = (
  org: string,
  table: string,
  row: string,
  field: string,
  cursor = 0,
) =>
  linkRequest<LinkPage>(
    org,
    table,
    `/rows/${encodeURIComponent(row)}/links/${encodeURIComponent(field)}?cursor=${cursor}`,
  );
export const getLinkedRow = (org: string, table: string, row: string) =>
  linkRequest<{
    row: DataTableRow;
    fields: DataTableField[];
    canEdit: boolean;
    table: DataTable;
  }>(org, table, `/rows/${encodeURIComponent(row)}`);
