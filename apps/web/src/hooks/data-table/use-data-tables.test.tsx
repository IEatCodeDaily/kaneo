import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DataTable,
  DataTableRow,
  LinkValue,
  TableRowQueryResult,
} from "@/types/data-table";

/**
 * Regression: every cell edit invalidated the paged row-query caches, so the
 * grid swapped to its loading state and remounted the whole table after each
 * keystroke-commit. The mutation must patch the cached row in place — server
 * truth merged into the cache, no rows invalidation, rollback on failure.
 */

const upsertFetcher = vi.fn(async () => ({
  id: "row-1",
  position: 0,
  createdAt: "",
  updatedAt: "",
  values: { f1: "server" } as Record<string, unknown>,
}));
const linkWriteResponse = {
  id: "row-1",
  position: 0,
  createdAt: "",
  updatedAt: "",
  values: {
    fl1: {
      kind: "link",
      status: "ok",
      records: [{ id: "lr-1", label: "Server" }],
      total: 1,
      hasMore: false,
      version: "v2",
    },
  } as Record<string, unknown>,
};
const linkFetcher = vi.fn(async () => linkWriteResponse);
const updateFieldFetcher = vi.fn(async () => ({
  id: "f1",
  tableId: "t-1",
  name: "Renamed",
  type: "text" as const,
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
}));

vi.mock("@/fetchers/data-table/data-table", () => ({
  createDataTable: vi.fn(),
  createDataTableField: vi.fn(),
  createDataTableRow: vi.fn(),
  deleteDataTable: vi.fn(),
  deleteDataTableField: vi.fn(),
  deleteDataTableRow: vi.fn(),
  getDataTable: vi.fn(),
  getDataTables: vi.fn(),
  purgeDataTable: vi.fn(),
  restoreDataTable: vi.fn(),
  updateDataTable: vi.fn(),
  updateDataTableField: (...args: unknown[]) =>
    updateFieldFetcher(...(args as [])),
  upsertDataTableCell: (...args: unknown[]) => upsertFetcher(...(args as [])),
}));
vi.mock("@/fetchers/data-table/links", () => ({
  linkRequest: (...args: unknown[]) => linkFetcher(...(args as [])),
}));

const { useDataTableMutations } = await import("./use-data-tables");

const ORG = "org-1";
const TABLE = "t-1";
const DETAIL_KEY = ["data-table", ORG, TABLE] as const;
const rowsKey = (query: object) => [...DETAIL_KEY, "rows", query] as const;
const otherTableRowsKey = ["data-table", ORG, "t-2", "rows", {}] as const;

const row = (id: string, values: Record<string, unknown>): DataTableRow => ({
  id,
  position: 0,
  createdAt: "",
  updatedAt: "",
  values,
});

const page = (rows: DataTableRow[]): TableRowQueryResult => ({
  rows,
  total: rows.length,
  tableTotal: rows.length,
  summaries: {},
  groups: [],
  tickets: {},
});

const infinite = (
  result: TableRowQueryResult,
): InfiniteData<TableRowQueryResult> => ({
  pages: [result],
  pageParams: [0],
});

const detail: DataTable = {
  id: TABLE,
  organizationId: ORG,
  name: "Invoices",
  icon: null,
  deletedAt: null,
  createdAt: "",
  updatedAt: "",
  fields: [
    {
      id: "f1",
      tableId: TABLE,
      name: "Amount",
      type: "text",
      options: null,
      position: 0,
      createdAt: "",
      updatedAt: "",
    },
  ],
  rows: [row("row-1", { f1: "old" })],
  total: 1,
};

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  invalidated = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
    invalidated.push((filters?.queryKey ?? []) as unknown[]);
    return Promise.resolve();
  });
  client.setQueryData([...DETAIL_KEY], detail);
  client.setQueryData(
    rowsKey({ search: "" }),
    infinite(page([row("row-1", { f1: "old" }), row("row-2", { f1: "keep" })])),
  );
  client.setQueryData(
    rowsKey({ search: "Amount" }),
    infinite(page([row("row-1", { f1: "old" })])),
  );
  client.setQueryData(otherTableRowsKey, infinite(page([row("row-9", {})])));
});

/** True when some invalidation targeted THIS table's row-query caches. */
function rowsInvalidated() {
  return invalidated.some(
    (key) => key[0] === "data-table" && key[2] === TABLE && key[3] === "rows",
  );
}

describe("upsertCell cache patching", () => {
  it("patches every cached row page and the detail row without invalidating", async () => {
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await result.current.upsertCell.mutateAsync({
      organizationId: ORG,
      tableId: TABLE,
      rowId: "row-1",
      fieldId: "f1",
      value: "optimistic",
    });

    // Server truth merged into every cached page — optimistic value replaced.
    const unfiltered = client.getQueryData<InfiniteData<TableRowQueryResult>>(
      rowsKey({ search: "" }),
    );
    expect(unfiltered?.pages[0].rows[0].values.f1).toBe("server");
    expect(unfiltered?.pages[0].rows[1].values.f1).toBe("keep");
    const filtered = client.getQueryData<InfiniteData<TableRowQueryResult>>(
      rowsKey({ search: "Amount" }),
    );
    expect(filtered?.pages[0].rows[0].values.f1).toBe("server");
    // The prefix patch must not leak into other tables' caches.
    const other =
      client.getQueryData<InfiniteData<TableRowQueryResult>>(otherTableRowsKey);
    expect(other?.pages[0].rows[0].id).toBe("row-9");

    // The detail cache row merged too (row sheet reads it via the same data).
    expect(
      client.getQueryData<DataTable>([...DETAIL_KEY])?.rows[0].values.f1,
    ).toBe("server");

    // The whole point: the grid's row queries stay untouched.
    expect(rowsInvalidated()).toBe(false);
    expect(client.getQueryState(rowsKey({ search: "" }))?.isInvalidated).toBe(
      false,
    );
    // History still refreshes.
    expect(invalidated.some((key) => key[0] === "data-table-activity")).toBe(
      true,
    );
  });

  it("rolls the row-query caches back when the write fails", async () => {
    upsertFetcher.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await expect(
      result.current.upsertCell.mutateAsync({
        organizationId: ORG,
        tableId: TABLE,
        rowId: "row-1",
        fieldId: "f1",
        value: "optimistic",
      }),
    ).rejects.toThrow("nope");

    expect(
      client.getQueryData<InfiniteData<TableRowQueryResult>>(
        rowsKey({ search: "" }),
      )?.pages[0].rows[0].values.f1,
    ).toBe("old");
    expect(
      client.getQueryData<DataTable>([...DETAIL_KEY])?.rows[0].values.f1,
    ).toBe("old");
  });
});

describe("linkCell cache patching", () => {
  const optimisticLink: LinkValue = {
    kind: "link",
    status: "ok",
    records: [{ id: "lr-9", label: "Picked" }],
    total: 1,
    hasMore: false,
    version: "v1",
  };

  it("patches every cached page with the link pick and never invalidates rows", async () => {
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await result.current.linkCell.mutateAsync({
      organizationId: ORG,
      tableId: TABLE,
      rowId: "row-1",
      fieldId: "fl1",
      add: ["lr-9"],
      optimistic: optimisticLink,
      targetTableId: "t-2",
    });

    // Optimistic pick replaced by server truth in every cached page.
    const unfiltered = client.getQueryData<InfiniteData<TableRowQueryResult>>(
      rowsKey({ search: "" }),
    );
    expect(unfiltered?.pages[0].rows[0].values.fl1).toEqual(
      linkWriteResponse.values.fl1,
    );
    expect(unfiltered?.pages[0].rows[1].values.fl1).toBeUndefined();
    const filtered = client.getQueryData<InfiniteData<TableRowQueryResult>>(
      rowsKey({ search: "Amount" }),
    );
    expect(filtered?.pages[0].rows[0].values.fl1).toBeDefined();
    // The linked record's mirrored cell lives in the target table's caches:
    // marked stale (free refetch on mount), never the current grid's pages.
    expect(
      invalidated.some(
        (key) =>
          key[0] === "data-table" &&
          key[1] === ORG &&
          key[2] === "t-2" &&
          key[3] === "rows",
      ),
    ).toBe(true);
    expect(rowsInvalidated()).toBe(false);
    expect(client.getQueryState(rowsKey({ search: "" }))?.isInvalidated).toBe(
      false,
    );
    expect(invalidated.some((key) => key[0] === "data-table-activity")).toBe(
      true,
    );
    // The other table's cached rows are untouched by the patch itself.
    const other =
      client.getQueryData<InfiniteData<TableRowQueryResult>>(otherTableRowsKey);
    expect(other?.pages[0].rows[0].id).toBe("row-9");
  });

  it("rolls the optimistic link value back when the write fails", async () => {
    linkFetcher.mockRejectedValueOnce(new Error("conflict"));
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await expect(
      result.current.linkCell.mutateAsync({
        organizationId: ORG,
        tableId: TABLE,
        rowId: "row-1",
        fieldId: "fl1",
        add: ["lr-9"],
        optimistic: optimisticLink,
      }),
    ).rejects.toThrow("conflict");

    expect(
      client.getQueryData<InfiniteData<TableRowQueryResult>>(
        rowsKey({ search: "" }),
      )?.pages[0].rows[0].values.fl1,
    ).toBeUndefined();
  });
});

describe("mergeRowValues (linked new-row path)", () => {
  it("patches the field's link value across detail and pages without invalidating", async () => {
    const { mergeRowValues } = await import("./use-data-tables");
    mergeRowValues(client, [...DETAIL_KEY], "row-1", {
      fl1: {
        kind: "link",
        status: "ok",
        records: [{ id: "lr-2", label: "Fresh row" }],
        total: 1,
        hasMore: false,
        version: "v3",
      },
    });

    expect(
      client.getQueryData<InfiniteData<TableRowQueryResult>>(
        rowsKey({ search: "" }),
      )?.pages[0].rows[0].values.fl1,
    ).toMatchObject({ records: [{ id: "lr-2" }] });
    expect(
      client.getQueryData<DataTable>([...DETAIL_KEY])?.rows[0].values.fl1,
    ).toMatchObject({ records: [{ id: "lr-2" }] });
    expect(rowsInvalidated()).toBe(false);
    expect(invalidated).toEqual([]);
  });
});

describe("updateField cache patching", () => {
  it("patches the field in the detail cache without invalidating rows", async () => {
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await result.current.updateField.mutateAsync({
      organizationId: ORG,
      tableId: TABLE,
      fieldId: "f1",
      name: "Renamed",
    });

    const updated = client.getQueryData<DataTable>([...DETAIL_KEY]);
    expect(updated?.fields[0].name).toBe("Renamed");
    expect(rowsInvalidated()).toBe(false);
    expect(invalidated.filter((key) => key[0] === "data-table")).toEqual([]);
  });

  it("keeps the full refresh for type changes (values can convert)", async () => {
    const { result } = renderHook(() => useDataTableMutations(ORG, TABLE), {
      wrapper,
    });

    await result.current.updateField.mutateAsync({
      organizationId: ORG,
      tableId: TABLE,
      fieldId: "f1",
      type: "number",
    });

    expect(invalidated.some((key) => key[0] === "data-table")).toBe(true);
  });
});
