import type { InfiniteData } from "@tanstack/react-query";
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
  TableRowQueryResult,
  UpsertDataTableCellInput,
} from "@/types/data-table";

export const dataTableKeys = {
  all: ["data-tables"] as const,
  list: (organizationId: string) => ["data-tables", organizationId] as const,
  detail: (organizationId: string, tableId: string) =>
    ["data-table", organizationId, tableId] as const,
  /** Prefix-matches every row's history too (rowId is appended). */
  activity: (tableId: string) => ["data-table-activity", tableId] as const,
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
    // Tables do not receive the board's WebSocket updates.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

type RowQueryPage = TableRowQueryResult;

/** Patch one row inside every page of an infinite row-query cache. */
function patchRowsPages(
  data: InfiniteData<RowQueryPage> | undefined,
  rowId: string,
  next: (row: DataTableRow) => DataTableRow,
): InfiniteData<RowQueryPage> | undefined {
  if (!data) return data;
  const patchPage = (page: RowQueryPage): RowQueryPage =>
    page.rows.some((row) => row.id === rowId)
      ? {
          ...page,
          rows: page.rows.map((row) => (row.id === rowId ? next(row) : row)),
        }
      : page;
  return { ...data, pages: data.pages.map(patchPage) };
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
  // Every write lands in the activity log, so history refreshes with data.
  const refreshActivity = () =>
    tableId
      ? queryClient.invalidateQueries({
          queryKey: dataTableKeys.activity(tableId),
        })
      : Promise.resolve();
  const refreshDetail = () =>
    detailKey
      ? Promise.all([
          queryClient.invalidateQueries({ queryKey: detailKey }),
          refreshActivity(),
        ])
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
      onSuccess: (field, vars) => {
        // A type change can convert values server-side — re-pull. A rename or
        // options tweak never touches row data: patch the detail cache so the
        // grid's row queries stay untouched (no full-grid refetch flash).
        if (vars.type !== undefined) return refreshDetail();
        if (detailKey)
          queryClient.setQueryData<DataTable>(detailKey, (draft) =>
            draft
              ? {
                  ...draft,
                  fields: draft.fields.map((f) =>
                    f.id === field.id ? field : f,
                  ),
                }
              : draft,
          );
        void refreshActivity();
      },
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
        // The grid renders the paged row-query caches ([...detail, "rows", q]),
        // not the detail rows — snapshot them before patching.
        const rowsPrefix = [...detailKey, "rows"] as const;
        const rowsSnapshot = queryClient.getQueriesData({
          queryKey: rowsPrefix,
        });
        const patch = (row: DataTableRow): DataTableRow => ({
          ...row,
          values: { ...row.values, [fieldId]: value },
        });
        queryClient.setQueryData<DataTable>(detailKey, (draft) =>
          patchRow(draft, rowId, patch),
        );
        for (const [key, data] of rowsSnapshot)
          queryClient.setQueryData(
            key,
            patchRowsPages(
              data as InfiniteData<TableRowQueryResult>,
              rowId,
              patch,
            ),
          );
        return { previous, rowsSnapshot };
      },
      onSuccess: (row) => {
        void refreshActivity();
        if (!detailKey) return;
        // Merge values only: replacing the row would clobber another cell's
        // in-flight optimistic value with stale server data.
        queryClient.setQueryData<DataTable>(detailKey, (draft) => {
          const patched = patchRow(draft, row.id, (cached) => ({
            ...cached,
            values: { ...cached.values, ...row.values },
          }));
          // Ticket cells resolve through the table-level lookup; fold in the
          // refs the write response carries for newly linked tickets.
          return patched && row.tickets
            ? { ...patched, tickets: { ...patched.tickets, ...row.tickets } }
            : patched;
        });
        // Server truth merged straight into every cached page — no
        // invalidation, so the grid never swaps to its loading state.
        // ponytail: sort order, filters and summary totals go stale until the
        // next structural refresh (any query-shape change refetches); accept
        // until an edit visibly lands in the wrong spot after a sort.
        for (const [key, data] of queryClient.getQueriesData({
          queryKey: [...detailKey, "rows"],
        })) {
          queryClient.setQueryData(
            key,
            patchRowsPages(
              data as InfiniteData<TableRowQueryResult>,
              row.id,
              (cached) => ({
                ...cached,
                values: { ...cached.values, ...row.values },
              }),
            ),
          );
          // Fold response ticket refs into the pages that hold this row.
          if (row.tickets)
            queryClient.setQueryData<
              InfiniteData<TableRowQueryResult> | undefined
            >(key, (current) =>
              current
                ? {
                    ...current,
                    pages: current.pages.map((page) =>
                      page.rows.some((r) => r.id === row.id)
                        ? {
                            ...page,
                            tickets: { ...page.tickets, ...row.tickets },
                          }
                        : page,
                    ),
                  }
                : current,
            );
        }
      },
      onError: (_error, _vars, context) => {
        if (!detailKey) return;
        if (context?.previous)
          queryClient.setQueryData(detailKey, context.previous);
        for (const [key, data] of context?.rowsSnapshot ?? [])
          queryClient.setQueryData(key, data);
        if (context?.previous) {
          // The snapshot predates any other in-flight cell's confirmed write;
          // re-pull server truth so those writes are not visually lost.
          queryClient.invalidateQueries({ queryKey: detailKey });
        }
      },
    }),
  };
}
