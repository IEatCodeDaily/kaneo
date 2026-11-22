import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

it("auto-expands a truncated link field so chips flow without any control", async () => {
  // The server previews 3 records per link cell; within the cap the drawer
  // fetches the rest on open — chips flow and fill, no Show-all button.
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
      version: "v1",
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
  // Scope to the property list: the drawer title also renders the link chips
  // (primary field), so global text queries would match twice.
  const sheet = within(
    document.querySelector('[data-slot="row-fields"]') as HTMLElement,
  );
  await waitFor(() => expect(sheet.getByText("Five")).toBeInTheDocument());
  expect(sheet.getByText("Four")).toBeInTheDocument();
  expect(linkedFetcher).toHaveBeenCalledTimes(2);
  // Within the cap there is no manual control at all.
  expect(
    screen.queryByRole("button", { name: /showAllRecords/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/linkedCapped/)).not.toBeInTheDocument();
});

it("beyond the auto cap the +N chip paginates the full list on demand", async () => {
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
  const records = Array.from({ length: 201 }, (_, i) => ({
    id: `r${i}`,
    label: `Rec ${String(i + 1).padStart(3, "0")}`,
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
        total: 201,
        hasMore: true,
        version: "v1",
      },
    },
  };
  // One full page per cursor (50), like the real endpoint.
  linkedFetcher.mockImplementation(
    (_org: unknown, _t: unknown, _r: unknown, _f: unknown, cursor?: number) => {
      const start = cursor ?? 0;
      const slice = records.slice(start, start + 50);
      return Promise.resolve({
        records: slice,
        total: 201,
        hasMore: start + slice.length < 201,
        nextCursor: start + slice.length < 201 ? start + slice.length : null,
        version: "v1",
      });
    },
  );
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
  const sheet = within(
    document.querySelector('[data-slot="row-fields"]') as HTMLElement,
  );
  // Auto-expand stops at the cap: 50 chips + the inline "+151" Show-all chip.
  await waitFor(() => expect(sheet.getByText("Rec 050")).toBeInTheDocument());
  expect(sheet.queryByText("Rec 201")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.showAllRecords" }),
  );
  // The walk stops at the 200-render cap: Rec 200 renders, 201 stays linked
  // in the count, and the cap note replaces any collapse control.
  await waitFor(() => expect(sheet.getByText("Rec 200")).toBeInTheDocument());
  expect(sheet.queryByText("Rec 201")).not.toBeInTheDocument();
  expect(screen.getByText(/linkedCapped/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /showLessRecords/ }),
  ).not.toBeInTheDocument();
});
