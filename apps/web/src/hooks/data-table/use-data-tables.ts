import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDataTable,
  createDataTableField,
  createDataTableRow,
  deleteDataTable,
  deleteDataTableField,
  deleteDataTableRow,
  getDataTable,
  getDataTables,
  purgeDataTable,
  restoreDataTable,
  updateDataTable,
  updateDataTableField,
  upsertDataTableCell,
} from "@/fetchers/data-table/data-table";
import type {
  DataTable,
  DataTableRow,
  UpsertDataTableCellInput,
} from "@/types/data-table";

export const dataTableKeys = {
  all: ["data-tables"] as const,
  list: (organizationId: string) => ["data-tables", organizationId] as const,
  detail: (organizationId: string, tableId: string) =>
    ["data-table", organizationId, tableId] as const,
};

export function useDataTables(organizationId: string, enabled = true) {
  return useQuery({
    queryKey: dataTableKeys.list(organizationId),
    queryFn: () => getDataTables(organizationId),
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useDataTable(organizationId: string, tableId: string) {
  return useQuery({
    queryKey: dataTableKeys.detail(organizationId, tableId),
    queryFn: () => getDataTable(tableId, organizationId),
    enabled: Boolean(organizationId && tableId),
  });
}

function patchRow(
  draft: DataTable | undefined,
  rowId: string,
  next: DataTableRow | ((row: DataTableRow) => DataTableRow),
): DataTable | undefined {
  if (!draft) return draft;
  return {
    ...draft,
    rows: draft.rows.map((row) =>
      row.id === rowId ? (typeof next === "function" ? next(row) : next) : row,
    ),
  };
}

export function useDataTableMutations(
  organizationId: string,
  tableId?: string,
) {
  const queryClient = useQueryClient();
  const detailKey = tableId
    ? dataTableKeys.detail(organizationId, tableId)
    : null;
  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: dataTableKeys.list(organizationId),
    });
  const refreshDetail = () =>
    detailKey
      ? queryClient.invalidateQueries({ queryKey: detailKey })
      : Promise.resolve();
  const refreshAll = async () => {
    await Promise.all([refreshList(), refreshDetail()]);
  };

  return {
    createTable: useMutation({
      mutationFn: createDataTable,
      onSuccess: refreshList,
    }),
    updateTable: useMutation({
      mutationFn: updateDataTable,
      onSuccess: refreshAll,
    }),
    deleteTable: useMutation({
      mutationFn: deleteDataTable,
      onSuccess: refreshAll,
    }),
    restoreTable: useMutation({
      mutationFn: restoreDataTable,
      onSuccess: refreshAll,
    }),
    purgeTable: useMutation({
      mutationFn: purgeDataTable,
      onSuccess: refreshList,
    }),
    createField: useMutation({
      mutationFn: createDataTableField,
      onSuccess: refreshDetail,
    }),
    updateField: useMutation({
      mutationFn: updateDataTableField,
      onSuccess: refreshDetail,
    }),
    deleteField: useMutation({
      mutationFn: deleteDataTableField,
      onSuccess: refreshDetail,
    }),
    createRow: useMutation({
      mutationFn: createDataTableRow,
      onSuccess: refreshDetail,
    }),
    deleteRow: useMutation({
      mutationFn: deleteDataTableRow,
      onSuccess: refreshDetail,
    }),
    // Optimistic: patch the cached row in place, no refetch per edit. The
    // response row is the server truth; on failure the snapshot rolls back.
    upsertCell: useMutation({
      mutationFn: upsertDataTableCell,
      onMutate: async ({ rowId, fieldId, value }: UpsertDataTableCellInput) => {
        if (!detailKey) return;
        await queryClient.cancelQueries({ queryKey: detailKey });
        const previous = queryClient.getQueryData<DataTable>(detailKey);
        queryClient.setQueryData<DataTable>(detailKey, (draft) =>
          patchRow(draft, rowId, (row) => ({
            ...row,
            values: { ...row.values, [fieldId]: value },
          })),
        );
        return { previous };
      },
      onSuccess: (row) => {
        if (!detailKey) return;
        // Merge values only: replacing the row would clobber another cell's
        // in-flight optimistic value with stale server data.
        queryClient.setQueryData<DataTable>(detailKey, (draft) =>
          patchRow(draft, row.id, (cached) => ({
            ...cached,
            values: { ...cached.values, ...row.values },
          })),
        );
      },
      onError: (_error, _vars, context) => {
        if (detailKey && context?.previous) {
          queryClient.setQueryData(detailKey, context.previous);
          // The snapshot predates any other in-flight cell's confirmed write;
          // re-pull server truth so those writes are not visually lost.
          queryClient.invalidateQueries({ queryKey: detailKey });
        }
      },
    }),
  };
}
