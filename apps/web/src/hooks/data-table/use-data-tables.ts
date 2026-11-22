import type { InfiniteData, QueryClient } from "@tanstack/react-query";
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
import { linkRequest } from "@/fetchers/data-table/links";
import type {
  DataTable,
  DataTableRow,
  LinkValue,
  TableRowQueryResult,
  TicketRef,
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

type RowWriteContext = {
  previous?: DataTable;
  rowsSnapshot: Array<[readonly unknown[], unknown]>;
};

/**
 * Snapshot + optimistically write `values` into the row's cached copies
 * (detail + every paged row-query cache — the grid renders the pages).
 */
function optimisticRowValues(
  queryClient: QueryClient,
  detailKey: readonly unknown[],
  rowId: string,
  values: Record<string, unknown>,
): Promise<RowWriteContext> {
  const rowsPrefix = [...detailKey, "rows"] as const;
  const previous = queryClient.getQueryData<DataTable>(detailKey);
  const rowsSnapshot = queryClient.getQueriesData({ queryKey: rowsPrefix });
  const patch = (row: DataTableRow): DataTableRow => ({
    ...row,
    values: { ...row.values, ...values },
  });
  queryClient.setQueryData<DataTable>(detailKey, (draft) =>
    patchRow(draft, rowId, patch),
  );
  for (const [key, data] of rowsSnapshot)
    queryClient.setQueryData(
      key,
      patchRowsPages(data as InfiniteData<TableRowQueryResult>, rowId, patch),
    );
  // Stop any in-flight refetch from clobbering the optimistic patch.
  return queryClient
    .cancelQueries({ queryKey: detailKey })
    .then(() => ({ previous, rowsSnapshot }));
}

/** Restore a snapshot after a failed write; re-pull server truth. */
function rollbackRowValues(
  queryClient: QueryClient,
  detailKey: readonly unknown[],
  context: RowWriteContext | undefined,
) {
  if (!context) return;
  if (context.previous) queryClient.setQueryData(detailKey, context.previous);
  for (const [key, data] of context.rowsSnapshot)
    queryClient.setQueryData(key, data);
  if (context.previous) {
    // The snapshot predates any other in-flight cell's confirmed write;
    // re-pull server truth so those writes are not visually lost.
    queryClient.invalidateQueries({ queryKey: detailKey });
  }
}

/** Row write response: values plus the ticket refs the write touched. */
type RowWriteResponse = DataTableRow & { tickets?: Record<string, TicketRef> };

/**
 * Merge server-truth row values (+ ticket refs) into the detail cache and
 * every cached page — no invalidation, so the grid never swaps to its
 * loading state.
 */
function mergeRowWrite(
  queryClient: QueryClient,
  detailKey: readonly unknown[],
  row: RowWriteResponse,
) {
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
      queryClient.setQueryData<InfiniteData<TableRowQueryResult> | undefined>(
        key,
        (current) =>
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
}

/** Post-write values patch without a row response (link + new-row path). */
export function mergeRowValues(
  queryClient: QueryClient,
  detailKey: readonly unknown[],
  rowId: string,
  values: Record<string, unknown>,
) {
  const patch = (row: DataTableRow): DataTableRow => ({
    ...row,
    values: { ...row.values, ...values },
  });
  queryClient.setQueryData<DataTable>(detailKey, (draft) =>
    patchRow(draft, rowId, patch),
  );
  for (const [key, data] of queryClient.getQueriesData({
    queryKey: [...detailKey, "rows"],
  }))
    queryClient.setQueryData(
      key,
      patchRowsPages(data as InfiniteData<TableRowQueryResult>, rowId, patch),
    );
}

export type LinkCellWriteInput = {
  organizationId: string;
  tableId: string;
  rowId: string;
  fieldId: string;
  add?: string[];
  remove?: string[];
  ifVersion?: string;
  /** LinkValue shown in the caches until the server responds. */
  optimistic: LinkValue;
  /**
   * The write is mirrored onto this table's link cells; its caches are not
   * rendered right now, so marking them stale is a free refetch on mount.
   */
  targetTableId?: string;
};

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
      onMutate: ({ rowId, fieldId, value }: UpsertDataTableCellInput) =>
        detailKey
          ? optimisticRowValues(queryClient, detailKey, rowId, {
              [fieldId]: value,
            })
          : undefined,
      onSuccess: (row) => {
        void refreshActivity();
        if (detailKey) mergeRowWrite(queryClient, detailKey, row);
      },
      onError: (_error, _vars, context) => {
        if (detailKey) rollbackRowValues(queryClient, detailKey, context);
      },
    }),
    // Same optimistic flow for link-field picks: the picker's POST returns
    // the updated row, so the caches merge server truth instead of the old
    // invalidate-everything refetch (the linked-column edit flash).
    linkCell: useMutation({
      mutationFn: ({
        organizationId: org,
        tableId,
        rowId,
        fieldId,
        add,
        remove,
        ifVersion,
      }: LinkCellWriteInput) =>
        linkRequest<RowWriteResponse>(
          org,
          tableId,
          `/rows/${encodeURIComponent(rowId)}/links/${encodeURIComponent(fieldId)}`,
          { add, remove, ifVersion },
        ),
      onMutate: ({ rowId, fieldId, optimistic }: LinkCellWriteInput) =>
        detailKey
          ? optimisticRowValues(queryClient, detailKey, rowId, {
              [fieldId]: optimistic,
            })
          : undefined,
      onSuccess: (row, vars) => {
        void refreshActivity();
        if (!detailKey) return;
        mergeRowWrite(queryClient, detailKey, row);
        if (vars.targetTableId)
          queryClient.invalidateQueries({
            queryKey: [
              ...dataTableKeys.detail(organizationId, vars.targetTableId),
              "rows",
            ],
          });
      },
      onError: (_error, _vars, context) => {
        if (detailKey) rollbackRowValues(queryClient, detailKey, context);
      },
    }),
  };
}
