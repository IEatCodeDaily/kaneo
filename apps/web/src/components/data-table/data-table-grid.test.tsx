import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataTable, DataTableFieldType } from "@/types/data-table";
import { legacyViewConfig, type SavedViewConfig } from "./saved-view-layout";

const { rowPages, upsertCell, createRow } = vi.hoisted(() => ({
  rowPages: vi.fn(),
  upsertCell: vi.fn().mockResolvedValue({}),
  createRow: vi.fn().mockResolvedValue({}),
}));

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key} ${values.name}` : key,
  }),
  Trans: () => null,
}));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: rowPages,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
    getTotalSize: () => opts.count * 32,
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        start: index * 32,
      })),
  }),
}));
vi.mock("@/components/common/layout", () => ({
  default: {
    Toolbar: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  },
}));
vi.mock("@/components/data-table/data-table-toolbar", () => ({
  DataTableToolbar: ({ onAddRow }: { onAddRow: () => void }) => (
    <button type="button" onClick={onAddRow}>
      Toolbar new row
    </button>
  ),
  FieldSelect: () => null,
  FilterConditionChip: () => null,
}));
vi.mock("@/components/data-table/row-sheet", () => ({
  RowSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="row-sheet" /> : null,
}));
vi.mock("@/components/data-table/table-activity", () => ({
  TableActivityList: () => null,
}));
vi.mock("@/components/data-table/field-options-dialog", () => ({
  default: () => null,
}));
vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({
    useGetActiveOrganizationMembers: () => ({
      data: [{ id: "member", userId: "member", user: { name: "Ada" } }],
    }),
  }),
);
vi.mock("@/hooks/data-table/use-data-tables", () => ({
  dataTableKeys: { detail: () => [] },
  useDataTableMutations: () => ({
    createRow: { mutateAsync: createRow },
    deleteRow: {},
    deleteField: {},
    upsertCell: { mutateAsync: upsertCell },
    updateField: {},
  }),
}));
vi.mock("@/fetchers/data-table/data-table", () => ({
  createDataTableRow: vi.fn(),
  deleteDataTableRow: vi.fn(),
  queryTableRows: vi.fn(),
  exportTableRows: vi.fn(),
  importTableCsv: vi
    .fn()
    .mockResolvedValue({ created: 0, checked: 1, total: 1, errors: [] }),
  getTicketOptions: vi.fn().mockResolvedValue([]),
}));

import { importTableCsv } from "@/fetchers/data-table/data-table";
import { DataTableGrid } from "./data-table-grid";

const table = (type: DataTableFieldType = "text"): DataTable => ({
  id: "t",
  organizationId: "o",
  name: "Table",
  icon: null,
  deletedAt: null,
  createdAt: "",
  updatedAt: "",
  total: 1,
  fields: [
    {
      id: "first",
      tableId: "t",
      name: "Title",
      type,
      options: { choices: [{ id: "x", label: "Choice", color: "red" }] },
      position: 0,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "second",
      tableId: "t",
      name: "Other",
      type: "text",
      options: null,
      position: 1,
      createdAt: "",
      updatedAt: "",
    },
  ],
  rows: [
    {
      id: "r",
      position: 0,
      createdAt: "",
      updatedAt: "",
      createdBy: "member",
      updatedBy: "deleted-member",
      values: { first: type === "checkbox" ? true : "x", second: "other" },
    },
  ],
});
const mount = (
  type: DataTableFieldType = "text",
  canEdit = true,
  queryState = {},
  saved?: {
    initialConfig: SavedViewConfig;
    onConfigChange: (config: SavedViewConfig) => void;
  },
) => {
  rowPages.mockReturnValue({
    data: {
      pages: [
        {
          rows: table(type).rows,
          total: 1,
          tableTotal: 1,
          summaries: {},
          groups: [],
          tickets: {},
        },
      ],
    },
    hasNextPage: false,
    isError: false,
    isPending: false,
    isFetching: false,
    ...queryState,
  });
  return render(
    <DataTableGrid
      {...saved}
      table={table(type)}
      organizationId="o"
      organizationSlug="org"
      canEdit={canEdit}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("query loading and failure never claim empty results or render stale rows", () => {
  const view = mount("text", true, { isFetching: true });
  expect(screen.getByRole("status")).toHaveTextContent(
    "navigation:tables.queryLoading",
  );
  expect(screen.queryByRole("grid")).toBeNull();
  expect(screen.queryByText("navigation:tables.noMatches")).toBeNull();
  view.unmount();
  const refetch = vi.fn();
  mount("text", true, { isFetching: false, isError: true, refetch });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "navigation:tables.queryError",
  );
  expect(screen.queryByRole("grid")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.queryRetry" }),
  );
  expect(refetch).toHaveBeenCalledOnce();
});

it("toolbar opens the form without creating an empty row", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Toolbar new row" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(createRow).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "New entry" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.createRow" }),
  );
  await waitFor(() =>
    expect(createRow).toHaveBeenCalledWith({
      organizationId: "o",
      tableId: "t",
      values: { first: "New entry" },
    }),
  );
});

it("CSV import ignores system columns without shifting later data", async () => {
  const view = mount();
  const input = view.container.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [
        {
          text: async () =>
            "Created at,Title,Updated by,Other\n2026-11-17,Imported,Someone,Preserved",
        },
      ],
    },
  });
  await screen.findByRole("dialog");
  expect(importTableCsv).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.csvValidate" }),
  );
  await waitFor(() =>
    expect(importTableCsv).toHaveBeenCalledWith(
      { organizationId: "o", tableId: "t" },
      {
        csv: "Created at,Title,Updated by,Other\n2026-11-17,Imported,Someone,Preserved",
        mapping: [null, "first", null, "second"],
        offset: 0,
        preview: true,
      },
    ),
  );
});

it("system cells show names or Former member, never ids, and cannot edit", () => {
  localStorage.setItem("kaneo-table-system-fields:t", "true");
  mount();
  const cells = screen
    .getAllByRole("gridcell")
    .filter((cell) => cell.getAttribute("aria-readonly") === "true");
  expect(cells).toHaveLength(5);
  expect(cells[0]).toHaveTextContent("1");
  expect(cells[3]).toHaveTextContent("Ada");
  expect(cells[4]).toHaveTextContent("navigation:tables.formerMember");
  expect(screen.getByRole("grid")).not.toHaveTextContent("deleted-member");
  for (const cell of cells) {
    fireEvent.click(cell);
    fireEvent.click(cell);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
  }
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(upsertCell).not.toHaveBeenCalled();
});

describe("uniform first-column interaction", () => {
  it.each(["text", "checkbox", "select", "user", "ticket"] as const)(
    "%s primary selects without expanding and only Space opens the drawer",
    (type) => {
      mount(type);
      const cell = screen.getAllByRole("gridcell")[0];
      fireEvent.click(cell);
      expect(cell).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByTestId("row-sheet")).toBeNull();
      fireEvent.keyDown(screen.getByRole("grid"), { key: " " });
      expect(screen.getByTestId("row-sheet")).toBeInTheDocument();
    },
  );
  it("Enter edits a selected primary text cell instead of opening the drawer", () => {
    mount();
    fireEvent.click(screen.getAllByRole("gridcell")[0]);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(screen.queryByTestId("row-sheet")).toBeNull();
  });
  it("a second click anywhere in the selected primary starts editing", () => {
    mount();
    const cell = screen.getAllByRole("gridcell")[0];
    fireEvent.click(cell);
    fireEvent.click(cell);
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
  });
  it("primary checkbox selects first, then Enter toggles without expanding", async () => {
    mount("checkbox");
    const cell = screen.getAllByRole("gridcell")[0];
    fireEvent.click(cell);
    expect(upsertCell).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    await waitFor(() =>
      expect(upsertCell).toHaveBeenCalledWith(
        expect.objectContaining({ fieldId: "first", value: false }),
      ),
    );
    expect(screen.queryByTestId("row-sheet")).toBeNull();
  });
  it("primary select opens on Enter, never on first click", async () => {
    mount("select");
    fireEvent.click(screen.getAllByRole("gridcell")[0]);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(
      await screen.findByRole("option", { name: "Choice" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("row-sheet")).toBeNull();
  });
  it("failed grid save keeps the draft editable", async () => {
    upsertCell.mockRejectedValueOnce(new Error("failed"));
    mount();
    const cell = screen.getAllByRole("gridcell")[0];
    fireEvent.click(cell);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    const input = screen.getByRole("textbox", { name: "Title" });
    fireEvent.change(input, { target: { value: "recover this draft" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(upsertCell).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "recover this draft",
    );
  });
  it("read-only Enter cannot edit but the gutter still expands", () => {
    mount("text", false);
    fireEvent.click(screen.getAllByRole("gridcell")[0]);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Enter" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByTestId("row-sheet")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.expandRow" }),
    );
    expect(screen.getByTestId("row-sheet")).toBeInTheDocument();
  });
});

describe("bulk value labels", () => {
  it.each(["select", "user"] as const)(
    "shows the chosen %s label rather than its id",
    async (type) => {
      mount(type);
      fireEvent.click(
        screen.getByRole("checkbox", { name: "navigation:tables.selectRow" }),
      );
      const trigger = screen.getByRole("combobox");
      fireEvent.click(trigger);
      const label = type === "select" ? "Choice" : "Ada";
      fireEvent.click(await screen.findByRole("option", { name: label }));
      expect(trigger).toHaveTextContent(label);
    },
  );
});

describe("column geometry and resize", () => {
  it("freezes no data column by default; a stored freeze makes it sticky", () => {
    mount();
    const gutter = screen.getAllByRole("rowheader")[0];
    expect(gutter.className.split(/\s+/)).toContain("sticky");
    expect(gutter.className.split(/\s+/)).not.toContain("relative");
    const cells = screen.getAllByRole("gridcell");
    fireEvent.click(cells[1]);
    expect(cells[1].className).not.toContain("aria-selected:z-[6]");
    // Opt-in: by default no data column is sticky, not even the primary.
    expect(cells[0].className.split(/\s+/)).toContain("relative");
    // A persisted freeze count (kaneo-table-frozen:<tableId>) sticks 0..N.
    localStorage.setItem("kaneo-table-frozen:t", "1");
    cleanup();
    mount();
    expect(screen.getAllByRole("gridcell")[0].className.split(/\s+/)).toContain(
      "sticky",
    );
    expect(screen.getAllByRole("gridcell")[1].className.split(/\s+/)).toContain(
      "relative",
    );
  });
  it("keyboard resize shares tracks, round-trips through the saved view, and resets on double click", () => {
    let config = legacyViewConfig("t");
    const onConfigChange = (next: SavedViewConfig) => {
      config = next;
    };
    const view = mount(
      "text",
      true,
      {},
      { initialConfig: config, onConfigChange },
    );
    const handle = screen.getByRole("separator", {
      name: "navigation:tables.resizeColumn Title",
    });
    const before = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", String(before + 10));
    const header = screen.getAllByRole("row")[0];
    const body = screen.getAllByRole("row")[1];
    expect(header.style.gridTemplateColumns).toBe(
      body.style.gridTemplateColumns,
    );
    const resized = header.style.gridTemplateColumns;
    view.unmount();
    mount("text", true, {}, { initialConfig: config, onConfigChange });
    expect(screen.getAllByRole("row")[0].style.gridTemplateColumns).toBe(
      resized,
    );
    fireEvent.doubleClick(
      screen.getByRole("separator", {
        name: "navigation:tables.resizeColumn Title",
      }),
    );
    expect(
      screen.getByRole("separator", {
        name: "navigation:tables.resizeColumn Title",
      }),
    ).toHaveAttribute("aria-valuenow", String(before));
  });
  it("pointer resizing clamps widths and cancels back to the starting width", () => {
    mount();
    const handle = screen.getByRole("separator", {
      name: "navigation:tables.resizeColumn Title",
    });
    const before = handle.getAttribute("aria-valuenow");
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        button: 0,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(handle, event);
    };
    pointer("pointerdown", 100);
    pointer("pointermove", 10000);
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(
      800,
    );
    expect(handle.getAttribute("aria-valuenow")).not.toBe(before);
    pointer("pointercancel", 10000);
    expect(handle).toHaveAttribute("aria-valuenow", before);
  });
});

describe("spreadsheet keyboard navigation", () => {
  beforeEach(() => localStorage.clear());

  const keyTable = (
    over: {
      type?: DataTableFieldType;
      required?: boolean;
      values?: Record<string, unknown>;
    } = {},
  ): DataTable => {
    const base = table(over.type ?? "text");
    return {
      ...base,
      total: 2,
      fields: base.fields.map((f, i) =>
        over.required && i === 0
          ? { ...f, options: { ...f.options, required: true } }
          : f,
      ),
      rows: [
        {
          id: "r1",
          position: 0,
          createdAt: "",
          updatedAt: "",
          values: { first: "one", second: "two", ...over.values },
        },
        {
          id: "r2",
          position: 1,
          createdAt: "",
          updatedAt: "",
          values: { first: "three", second: "four" },
        },
      ],
    };
  };
  const mountKey = (over?: Parameters<typeof keyTable>[0]) => {
    const data = keyTable(over);
    // Rows come from the server row query since KFL-403.
    rowPages.mockReturnValue({
      data: {
        pages: [
          {
            rows: data.rows,
            total: data.rows.length,
            tableTotal: data.rows.length,
            summaries: {},
            groups: [],
            tickets: {},
          },
        ],
      },
      hasNextPage: false,
      isError: false,
      isPending: false,
      isFetching: false,
    });
    return render(
      <DataTableGrid
        table={data}
        organizationId="o"
        organizationSlug="org"
        canEdit
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
  };
  const cell = (index: number) => screen.getAllByRole("gridcell")[index];
  const select = (index: number) => {
    fireEvent.click(cell(index));
    expect(cell(index)).toHaveAttribute("aria-selected", "true");
  };
  const press = (key: string, init: Record<string, unknown> = {}) =>
    fireEvent.keyDown(screen.getByRole("grid"), { key, ...init });
  const active = () =>
    screen
      .getAllByRole("gridcell")
      .findIndex((c) => c.getAttribute("aria-selected") === "true");

  it("Tab wraps to the next row and Shift+Tab wraps back", () => {
    mountKey();
    select(0);
    press("Tab");
    expect(active()).toBe(1);
    press("Tab");
    expect(active()).toBe(2);
    press("Tab", { shiftKey: true });
    expect(active()).toBe(1);
    press("Tab", { shiftKey: true });
    expect(active()).toBe(0);
  });

  it("Tab at the grid's outer boundary escapes instead of clamping", () => {
    mountKey();
    select(3);
    press("Tab");
    expect(active()).toBe(3);
    select(0);
    press("Shift+Tab");
    expect(active()).toBe(0);
  });

  it("modifier+arrows jump to row and column edges", () => {
    mountKey();
    select(0);
    press("ArrowRight", { ctrlKey: true });
    expect(active()).toBe(1);
    press("ArrowDown", { ctrlKey: true });
    expect(active()).toBe(3);
    press("ArrowUp", { ctrlKey: true });
    expect(active()).toBe(1);
    press("ArrowLeft", { ctrlKey: true });
    expect(active()).toBe(0);
  });

  it("Delete clears an editable cell through the API", async () => {
    mountKey();
    select(0);
    press("Delete");
    await waitFor(() =>
      expect(upsertCell).toHaveBeenCalledWith(
        expect.objectContaining({ rowId: "r1", fieldId: "first", value: null }),
      ),
    );
  });

  it("Delete clears to false on checkbox and Backspace works too", async () => {
    mountKey({ type: "checkbox", values: { first: true } });
    select(0);
    press("Backspace");
    await waitFor(() =>
      expect(upsertCell).toHaveBeenCalledWith(
        expect.objectContaining({ fieldId: "first", value: false }),
      ),
    );
  });

  it("zero is a value: Delete still clears it", async () => {
    mountKey({ type: "number", values: { first: 0 } });
    select(0);
    press("Delete");
    await waitFor(() =>
      expect(upsertCell).toHaveBeenCalledWith(
        expect.objectContaining({ value: null }),
      ),
    );
  });

  it("Delete skips required fields", () => {
    mountKey({ required: true });
    select(0);
    press("Delete");
    expect(upsertCell).not.toHaveBeenCalled();
  });

  it("Delete skips read-only system fields", () => {
    localStorage.setItem("kaneo-table-system-fields:t", "true");
    mountKey();
    const system = screen
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("aria-readonly") === "true");
    fireEvent.click(system[0]);
    expect(system[0]).toHaveAttribute("aria-selected", "true");
    press("Delete");
    expect(upsertCell).not.toHaveBeenCalled();
  });

  it("typing replaces the value and Esc cancels without saving", async () => {
    mountKey();
    select(0);
    press("a");
    const input = screen.getByRole("textbox", { name: "Title" });
    expect(input).toHaveValue("a");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
    expect(upsertCell).not.toHaveBeenCalled();
    expect(active()).toBe(0);
  });

  it("modifier+printable does not edit", () => {
    mountKey();
    select(0);
    press("a", { ctrlKey: true });
    expect(screen.queryByRole("textbox")).toBeNull();
    press("a", { metaKey: true });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("row height setting drives the row box and wraps cells", () => {
    mountKey();
    expect(screen.getAllByRole("row")[1].style.height).toBe("32px");
    expect(cell(0).className).not.toContain("overflow-hidden");
    cleanup();
    localStorage.setItem("kaneo-table-density:t", "tall");
    mountKey();
    expect(screen.getAllByRole("row")[1].style.height).toBe("80px");
    expect(cell(0).className).toContain("overflow-hidden");
  });
});
