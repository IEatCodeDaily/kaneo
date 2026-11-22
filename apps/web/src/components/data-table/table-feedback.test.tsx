import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DataTableField,
  DataTableRow,
  TicketRef,
} from "@/types/data-table";

const { updateField, getTicketOptions } = vi.hoisted(() => ({
  updateField: vi.fn().mockResolvedValue({}),
  getTicketOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to: _to,
    ...props
  }: {
    children: React.ReactNode;
    params: { ticketKey: string };
    to: string;
  }) => (
    <a href={`/tickets/${params.ticketKey}`} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/fetchers/data-table/data-table", () => ({ getTicketOptions }));
vi.mock("@/hooks/data-table/use-data-tables", () => ({
  useDataTables: () => ({ data: [] }),
  useDataTable: () => ({ data: undefined }),
  dataTableKeys: {
    detail: () => [],
    activity: () => [],
  },
  mergeRowValues: vi.fn(),
  useDataTableMutations: () => ({
    createField: { mutateAsync: vi.fn(), isPending: false },
    updateField: { mutateAsync: updateField, isPending: false },
    linkCell: { mutateAsync: vi.fn().mockResolvedValue({}) },
  }),
}));
vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({ data: [] }),
}));
vi.mock("@/components/public-board/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <p>
      <strong>{content}</strong>
      <a href="https://example.com">Inspection report</a>
    </p>
  ),
}));

import { DataTableCellView } from "./data-table-cells";
import {
  DataTableCellContent,
  JsonCellEditor,
  TableCellInput,
} from "./data-table-editors";
import FieldOptionsDialog from "./field-options-dialog";
import {
  TicketCellPicker,
  TicketCellView,
  TicketLookupContext,
} from "./ticket-cell";

const field: DataTableField = {
  id: "f",
  tableId: "t",
  name: "Notes",
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
  values: { f: "original" },
};
const ticket = (id: string): TicketRef => ({
  id,
  key: `KFL-${id}`,
  title: `A long title ${id}`,
  status: "started",
  boardId: "b",
  boardSlug: "kfl",
});
const context = {
  organizationId: "o",
  organizationSlug: "org",
  tableId: "t",
  tickets: { a: ticket("a"), b: ticket("b"), c: ticket("c") },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("cell editing regressions", () => {
  it.each(["text", "number", "url"] as const)(
    "Escape cancels a changed %s draft without committing on blur",
    (type) => {
      const commit = vi.fn();
      const cancel = vi.fn();
      render(
        <TableCellInput
          field={{ ...field, type }}
          value={type === "number" ? 1 : "original"}
          onCommit={commit}
          onCancel={cancel}
        />,
      );
      const input = screen.getByLabelText("Notes");
      fireEvent.change(input, {
        target: { value: type === "number" ? "2" : "https://example.com" },
      });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(commit).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it("longtext accepts newlines; only modified Enter commits", () => {
    const commit = vi.fn();
    render(
      <TableCellInput
        field={{ ...field, type: "longtext" }}
        value="original"
        onCommit={commit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Notes" });
    expect(input.tagName).toBe("TEXTAREA");
    fireEvent.change(input, { target: { value: "line one\nline two" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(commit).toHaveBeenCalledWith("line one\nline two");
  });
  it("invalid JSON remains editable after blur", () => {
    const cancel = vi.fn();
    render(
      <JsonCellEditor
        field={{ ...field, type: "json" }}
        value={{ a: 1 }}
        onCommit={vi.fn()}
        onCancel={cancel}
      />,
    );
    const input = screen.getByLabelText("Notes");
    fireEvent.change(input, { target: { value: "{" } });
    fireEvent.blur(input);
    expect(cancel).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
  it("renders longtext markdown outside buttons and forwards expanded presentation", async () => {
    const { container } = render(
      <DataTableCellContent
        row={row}
        field={{ ...field, type: "longtext" }}
        members={new Map()}
        canEdit
        isEditing={false}
        expanded
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector("strong")).not.toBeNull(),
    );
    expect(container.querySelector("button a")).toBeNull();
    expect(container.querySelector('[data-expanded="true"]')).not.toBeNull();
  });
  it("never mounts an editor when edit access is absent", () => {
    render(
      <DataTableCellContent
        row={row}
        field={field}
        members={new Map()}
        canEdit={false}
        isEditing
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ticket presentation and current picker value", () => {
  it("uses one non-overlapping chip with +N in grid and wrapping chips in expanded cells", () => {
    const { container, rerender } = render(
      <TicketLookupContext.Provider value={context}>
        <TicketCellView value={["a", "b", "c"]} />
      </TicketLookupContext.Provider>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(
      container.querySelector("[data-ticket-chip]")?.className.split(/\s+/),
    ).toContain("overflow-hidden");
    rerender(
      <TicketLookupContext.Provider value={context}>
        <DataTableCellView
          field={{ ...field, type: "ticket" }}
          value={["a", "b", "c"]}
          members={new Map()}
          expanded
        />
      </TicketLookupContext.Provider>,
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByText("+2")).toBeNull();
  });
  it("picker contains no link nested in a button", () => {
    const { container } = render(
      <TicketLookupContext.Provider value={context}>
        <TicketCellPicker
          field={{ ...field, type: "ticket" }}
          value={["a"]}
          canEdit
          onCommit={vi.fn()}
        >
          <TicketCellView value={["a"]} />
        </TicketCellPicker>
      </TicketLookupContext.Provider>,
    );
    expect(container.querySelector("button a")).toBeNull();
  });
  it("newly selected search results immediately join linked options and remain removable", async () => {
    getTicketOptions.mockResolvedValue([ticket("new")]);
    function Picker() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <TicketLookupContext.Provider value={context}>
          <TicketCellPicker
            field={{ ...field, type: "ticket" }}
            value={value}
            canEdit
            onCommit={(next) => setValue(next as string[])}
          >
            pick
          </TicketCellPicker>
        </TicketLookupContext.Provider>
      );
    }
    render(<Picker />);
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.linkTicket" }),
    );
    const option = await screen.findByRole("option", { name: /KFL-new/ });
    fireEvent.click(option);
    expect(screen.getByRole("option", { name: /KFL-new/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: /KFL-new/ }));
    expect(screen.getByRole("option", { name: /KFL-new/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});

describe("type changes from field options", () => {
  it("Save never mutates a changed type; a double click confirms explicitly", async () => {
    render(
      <FieldOptionsDialog
        organizationId="o"
        tableId="t"
        field={field}
        open
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.typeNumber" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.editField" }),
    );
    expect(updateField).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", {
      name: "navigation:tables.confirmTypeDoubleClick",
    });
    fireEvent.click(confirm, { detail: 1 });
    expect(updateField).not.toHaveBeenCalled();
    fireEvent.doubleClick(confirm);
    await waitFor(() =>
      expect(updateField).toHaveBeenCalledWith(
        expect.objectContaining({ type: "number" }),
      ),
    );
  });
  it("keyboard needs two deliberate non-repeating activations and preserves failed confirmation", async () => {
    updateField.mockRejectedValueOnce(new Error("failed"));
    render(
      <FieldOptionsDialog
        organizationId="o"
        tableId="t"
        field={field}
        initialType="number"
        open
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "navigation:tables.editField" }),
    );
    const confirm = screen.getByRole("button", {
      name: "navigation:tables.confirmTypeDoubleClick",
    });
    fireEvent.keyDown(confirm, { key: "Enter" });
    expect(updateField).not.toHaveBeenCalled();
    fireEvent.keyDown(confirm, { key: "Enter", repeat: true });
    expect(updateField).not.toHaveBeenCalled();
    fireEvent.keyDown(confirm, { key: "Enter" });
    await waitFor(() => expect(updateField).toHaveBeenCalledOnce());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText("navigation:tables.changeTypeRecoverable"),
    ).toBeInTheDocument();
  });
});
