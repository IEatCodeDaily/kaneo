import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DataTableField, LinkValue, TableRowQueryResult } from "@/types/data-table";

/**
 * Regression (teams.36 live): picking a record in a link cell flashed the
 * optimistic chip, then reverted to the unchanged value. This drives the REAL
 * flow — fetch-level network mocks with the exact JSON bodies the API returns,
 * the real linkCell mutation, and a cell rendered from the paged rows cache
 * exactly like the grid renders it.
 */

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./row-sheet", () => ({ RowSheet: () => null }));

const ORG = "org-1";
const TABLE = "t-1";
const ROWS_KEY = ["data-table", ORG, TABLE, "rows", {}] as const;
const DETAIL_KEY = ["data-table", ORG, TABLE] as const;

const oldRecord = { id: "lr-old", label: "Old record" };
const newRecord = { id: "lr-new", label: "New record" };

const linkField: DataTableField = {
  id: "fl1",
  tableId: TABLE,
  name: "Related",
  type: "link",
  options: { relationId: "rel-1", targetTableId: "t-2", localMax: "many" },
  position: 1,
  createdAt: "",
  updatedAt: "",
};

/** Server truth after the pick, shaped exactly like the POST response. */
const serverRow = {
  id: "row-1",
  position: 0,
  createdAt: "2026-11-22T00:00:00.000Z",
  updatedAt: "2026-11-22T01:00:00.000Z",
  createdBy: "user-1",
  updatedBy: "user-1",
  deletedAt: null,
  values: {
    fl1: {
      kind: "link",
      status: "ok",
      records: [oldRecord, newRecord],
      total: 2,
      hasMore: false,
      searchText: "Old record New record",
      version: "vB",
    },
  },
};

const seedRow = {
  id: "row-1",
  position: 0,
  createdAt: "2026-11-22T00:00:00.000Z",
  updatedAt: "2026-11-22T00:00:00.000Z",
  createdBy: "user-1",
  updatedBy: null,
  deletedAt: null,
  values: {
    fl1: {
      kind: "link",
      status: "ok",
      records: [oldRecord],
      total: 1,
      hasMore: false,
      searchText: "Old record",
      version: "vA",
    },
  },
};

const seedPage: TableRowQueryResult = {
  rows: [seedRow],
  total: 1,
  tableTotal: 1,
  summaries: {},
  groups: [],
  tickets: {},
};

const json = (status: number, body: unknown) =>
  ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as Response;

const calls: Array<{ method: string; url: string; body: unknown }> = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  let body: unknown;
  if (typeof init?.body === "string") body = JSON.parse(init.body);
  calls.push({ method, url, body });
  if (url.includes("/fields/fl1/link-options"))
    return json(200, {
      records: [newRecord],
      hasMore: false,
      nextCursor: null,
      canLink: true,
      canCreate: true,
      primaryField: null,
      fields: [],
      targetTableId: "t-2",
      localMax: "many",
    });
  if (url.includes("/rows/row-1/links/fl1?") && method === "GET")
    return json(200, {
      records: [oldRecord],
      total: 1,
      hasMore: false,
      nextCursor: null,
      version: "vA",
    });
  if (url.includes("/rows/row-1/links/fl1") && method === "POST")
    return json(200, serverRow);
  throw new Error(`Unexpected fetch: ${method} ${url}`);
});

function CellHarness({ field }: { field: DataTableField }) {
  const pages = useInfiniteQuery({
    queryKey: ROWS_KEY,
    queryFn: () => Promise.resolve(seedPage),
    initialPageParam: 0,
    initialData: { pages: [seedPage], pageParams: [0] },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    getNextPageParam: () => undefined,
  });
  const gridRow = pages.data?.pages[0].rows.find((row) => row.id === "row-1");
  const value = gridRow?.values.fl1;
  return (
    <TicketLookupContext.Provider
      value={{
        organizationId: ORG,
        organizationSlug: ORG,
        tableId: TABLE,
        tickets: {},
      }}
    >
      <LinkCellPicker
        field={field}
        value={value}
        rowId="row-1"
        canEdit
        onCommit={() => {}}
        members={new Map()}
      >
        <LinkCellView value={value} expanded />
      </LinkCellPicker>
    </TicketLookupContext.Provider>
  );
}

import { LinkCellPicker, LinkCellView } from "./link-cell";
import { TicketLookupContext } from "./ticket-cell";

let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  calls.length = 0;
  fetchMock.mockClear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The detail cache exists on the table page; rows cache is seeded in the harness.
  client.setQueryData(DETAIL_KEY, {
    id: TABLE,
    organizationId: ORG,
    name: "Source",
    icon: null,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
    fields: [linkField],
    rows: [],
    total: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chip = (label: string) =>
  document.querySelector(`[data-link-chip]`)?.textContent;

async function pickAndSettle(field: DataTableField) {
  render(
    <QueryClientProvider client={client}>
      <CellHarness field={field} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.linkRecords" }),
  );
  fireEvent.click(await screen.findByRole("option", { name: "New record" }));
  // Optimistic: the chip appears before the POST resolves.
  await waitFor(() => {
    const state = (
      client.getQueryData<TableRowQueryResult>(ROWS_KEY)?.pages[0].rows[0]!
        .values.fl1 as LinkValue | undefined
    )?.version;
    if (state !== "vA") return;
    throw new Error(
      `cache not patched; calls=${JSON.stringify(calls)} alert=${screen.queryByRole("alert")?.textContent ?? "none"}`,
    );
  });
  expect(chip("x")).toContain("New record");
  // The write settles; the cell must show server truth — not roll back.
  await waitFor(() =>
    expect(
      (client.getQueryData<TableRowQueryResult>(ROWS_KEY)?.pages[0].rows[0]!)
        .values.fl1 as LinkValue,
    ).toMatchObject({ version: "vB", total: 2 }),
  );
  await waitFor(() => expect(chip("x")).toContain("New record"));
}

it("many-relation pick: optimistic chip persists through the server merge", async () => {
  await pickAndSettle(linkField);
  const post = calls.find((c) => c.method === "POST");
  expect(post?.body).toMatchObject({ add: ["lr-new"] });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("one-relation swap: versioned write persists through the server merge", async () => {
  await pickAndSettle({
    ...linkField,
    options: { relationId: "rel-1", targetTableId: "t-2", localMax: "one" },
  });
  const post = calls.find((c) => c.method === "POST");
  expect(post?.body).toMatchObject({
    add: ["lr-new"],
    remove: ["lr-old"],
    ifVersion: "vA",
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
