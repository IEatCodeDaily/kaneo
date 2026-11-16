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
vi.mock("@/components/data-table/table-activity", () => ({
  TableActivityList: () => null,
}));
vi.mock("@/fetchers/data-table/row-links", () => ({
  getRowTickets: async () => [],
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
afterEach(cleanup);

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
