import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  DataTable,
  DataTableField,
  DataTableRow,
} from "@/types/data-table";

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
const activityRender = vi.fn(() => null);
vi.mock("@/components/data-table/table-activity", () => ({
  TableActivityList: () => activityRender(),
}));
const ticketsFetcher = vi.fn(async () => []);
vi.mock("@/fetchers/data-table/row-links", () => ({
  getRowTickets: (...args: unknown[]) => ticketsFetcher(...(args as [])),
}));
const linkedFetcher = vi.fn();
vi.mock("@/fetchers/data-table/links", async (original) => ({
  ...(await original<typeof import("@/fetchers/data-table/links")>()),
  getLinkedRecords: (...args: unknown[]) => linkedFetcher(...(args as [])),
}));

import { RowSheet } from "./row-sheet";

const table: DataTable = {
  id: "t",
  organizationId: "o",
  name: "Samples",
  icon: null,
  deletedAt: null,
  fields: [],
  rows: [],
  total: 1,
  createdAt: "",
  updatedAt: "",
};
const field: DataTableField = {
  id: "f",
  tableId: "t",
  name: "Title",
  type: "text",
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
};
const row: DataTableRow = {
  id: "r",
  position: 0,
  createdAt: "",
  updatedAt: "",
  values: { f: "Original" },
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  activityRender.mockClear();
  ticketsFetcher.mockClear();
});

it("keeps the drawer's changed draft after a failed save, closing only after success", async () => {
  const commit = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RowSheet
        open
        onOpenChange={vi.fn()}
        table={table}
        row={row}
        rowIndex={0}
        rowCount={1}
        fields={[field]}
        members={new Map()}
        canEdit
        onCommit={commit}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        hasPrev={false}
        hasNext={false}
      />
    </QueryClientProvider>,
  );
  const system = document.querySelector('[data-slot="row-system-fields"]');
  expect(system).not.toHaveAttribute("open");
  expect(
    screen.getByRole("button", { name: "navigation:tables.copyRowId" }),
  ).not.toHaveAttribute("title");
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.editField" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Keep this draft" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Title" }), {
    key: "Enter",
  });
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Keep this draft",
  );
  screen.getByRole("textbox", { name: "Title" }).focus();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Title" }), {
    key: "Enter",
  });
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull(),
  );
});

it("defers the activity + tickets queries until the lower drawer scrolls into view", async () => {
  // Regression: both queries fired on the drawer's open path — below the
  // fold. They mount when the sentinel intersects (or instantly for a short
  // drawer / jsdom, which has no IntersectionObserver).
  let onIntersect: IntersectionObserverCallback = () => {};
  class MockIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      onIntersect = cb;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RowSheet
        open
        onOpenChange={vi.fn()}
        table={table}
        row={row}
        rowIndex={0}
        rowCount={1}
        fields={[field]}
        members={new Map()}
        canEdit
        onCommit={vi.fn().mockResolvedValue(true)}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        hasPrev={false}
        hasNext={false}
      />
    </QueryClientProvider>,
  );

  // Open path: fields render, the deferred sections do not, no queries fire.
  expect(
    screen.getByRole("button", { name: "navigation:tables.copyRowId" }),
  ).toBeInTheDocument();
  expect(
    document.querySelector('[data-testid="row-drawer-deferred"]'),
  ).not.toBeNull();
  expect(activityRender).not.toHaveBeenCalled();
  expect(ticketsFetcher).not.toHaveBeenCalled();

  // Scroll near the bottom: sections mount and the tickets query fires.
  onIntersect(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  await waitFor(() =>
    expect(
      document.querySelector('[data-testid="row-drawer-deferred"]'),
    ).toBeNull(),
  );
  expect(activityRender).toHaveBeenCalled();
  expect(ticketsFetcher).toHaveBeenCalled();
});

it("expands a truncated link field to the full record list on Show all", async () => {
  // The server previews 3 records per link cell; the drawer truncates until
  // the owner asks for the complete list.
  const linkField: DataTableField = {
    id: "lf",
    tableId: "t",
    name: "Related",
    type: "link",
    options: { relationId: "rel", targetTableId: "t2", localMax: "many" },
    position: 0,
    createdAt: "",
    updatedAt: "",
  };
  const records = ["One", "Two", "Three", "Four", "Five"].map((label, i) => ({
    id: `r${i}`,
    label,
  }));
  const linkRow: DataTableRow = {
    id: "r",
    position: 0,
    createdAt: "",
    updatedAt: "",
    values: {
      lf: {
        kind: "link",
        status: "ok",
        records: records.slice(0, 3),
        total: 5,
        hasMore: true,
        version: "v1",
      },
    },
  };
  linkedFetcher
    .mockResolvedValueOnce({
      records: records.slice(0, 3),
      total: 5,
      hasMore: true,
      nextCursor: 3,
      version: "v1",
    })
    .mockResolvedValueOnce({
      records: records.slice(3),
      total: 5,
      hasMore: false,
      nextCursor: null,
      version: "v2",
    });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RowSheet
        open
        onOpenChange={vi.fn()}
        table={table}
        row={linkRow}
        rowIndex={0}
        rowCount={1}
        fields={[linkField]}
        members={new Map()}
        canEdit
        onCommit={vi.fn().mockResolvedValue(true)}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        hasPrev={false}
        hasNext={false}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("One")).toBeInTheDocument();
  expect(screen.queryByText("Four")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.showAllRecords" }),
  );
  await waitFor(() => expect(screen.getByText("Five")).toBeInTheDocument());
  // All five render (jsdom lays everything out; the cap note only shows >200).
  expect(screen.getByText("Four")).toBeInTheDocument();
  expect(linkedFetcher).toHaveBeenCalledTimes(2);
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.showLessRecords" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Four")).not.toBeInTheDocument(),
  );
});
