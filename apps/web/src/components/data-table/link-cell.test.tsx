import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DataTableField } from "@/types/data-table";

const { options, linked, write } = vi.hoisted(() => ({
  options: vi.fn(),
  linked: vi.fn(),
  write: vi.fn(),
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./row-sheet", () => ({ RowSheet: () => null }));
vi.mock("@/fetchers/data-table/links", () => ({
  getLinkOptions: options,
  getLinkedRecords: linked,
  linkRequest: write,
  getLinkedRow: vi.fn(),
}));

import { LinkCellPicker, LinkCellView } from "./link-cell";
import { TicketLookupContext } from "./ticket-cell";

const field: DataTableField = {
  id: "field",
  tableId: "source",
  name: "Customer",
  type: "link",
  options: { relationId: "relation", targetTableId: "target", localMax: "one" },
  position: 1,
  createdAt: "",
  updatedAt: "",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("renders primary values and exact overflow, never ids", () => {
  render(
    <LinkCellView
      value={{
        kind: "link",
        status: "ok",
        records: [{ id: "opaque-id", label: "CUST-001" }],
        total: 37,
        hasMore: true,
        version: "v",
      }}
    />,
  );
  expect(screen.getByText("CUST-001")).toBeInTheDocument();
  expect(screen.getByText("+36")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("opaque-id");
});
it("keeps failed selection visible and sends a versioned explicit swap", async () => {
  options.mockResolvedValue({
    records: [{ id: "new", label: "New customer" }],
    canLink: true,
    canCreate: false,
    fields: [],
    targetTableId: "target",
    hasMore: false,
  });
  linked.mockResolvedValue({
    records: [{ id: "old", label: "Existing customer" }],
    version: "v1",
    total: 1,
    hasMore: false,
  });
  write.mockRejectedValue(new Error("Relationship changed"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TicketLookupContext.Provider
        value={{
          organizationId: "org",
          organizationSlug: "org",
          tableId: "source",
          tickets: {},
        }}
      >
        <LinkCellPicker
          field={field}
          value={{
            kind: "link",
            status: "ok",
            records: [{ id: "old", label: "Existing customer" }],
            version: "v1",
            total: 1,
          }}
          rowId="row"
          canEdit
          onCommit={() => {}}
          members={new Map()}
        >
          value
        </LinkCellPicker>
      </TicketLookupContext.Provider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.linkRecords" }),
  );
  fireEvent.click(await screen.findByRole("option", { name: "New customer" }));
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      "org",
      "source",
      "/rows/row/links/field",
      { add: ["new"], remove: ["old"], ifVersion: "v1" },
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Relationship changed",
  );
  expect(
    screen.getByRole("option", { name: "Existing customer" }),
  ).toBeInTheDocument();
});
