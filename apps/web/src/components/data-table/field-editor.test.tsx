import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { DataTableField } from "@/types/data-table";

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
const { createField } = vi.hoisted(() => ({
  createField: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/data-table/use-data-tables", () => ({
  useDataTables: () => ({ data: [] }),
  useDataTableMutations: () => ({
    createField: { mutateAsync: createField, isPending: false },
    updateField: { isPending: false },
  }),
}));
vi.mock("@/hooks/queries/board/use-get-boards", () => ({
  default: () => ({ data: [] }),
}));

import FieldOptionsDialog from "./field-options-dialog";
import { FieldTypePicker } from "./field-type-picker";
import { FieldValueEditor } from "./field-value-editor";
import { NewRowDialog } from "./new-row-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("enables link creation, groups every type, searches descriptions and supports keyboard navigation", () => {
  const onChange = vi.fn();
  render(<FieldTypePicker value="date" onChange={onChange} />);
  expect(screen.getAllByRole("group")).toHaveLength(6);
  expect(
    screen.getByRole("button", { name: "navigation:tables.linkToTable" }),
  ).toBeEnabled();
  const search = screen.getByRole("textbox");
  fireEvent.change(search, { target: { value: "datetime" } });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  search.focus();
  fireEvent.keyDown(search, { key: "ArrowDown" });
  const datetime = screen.getByRole("button", {
    name: "navigation:tables.typeDatetime",
  });
  expect(datetime).toHaveFocus();
  fireEvent.click(datetime);
  expect(onChange).toHaveBeenCalledWith("datetime");
  fireEvent.change(search, { target: { value: "date" } });
  expect(
    screen.getByRole("button", { name: "navigation:tables.typeDate" }),
  ).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(search, { target: { value: "no match" } });
  expect(
    screen.getByText("navigation:tables.noFieldTypes"),
  ).toBeInTheDocument();
});

const field: DataTableField = {
  id: "f",
  tableId: "t",
  name: "Default",
  type: "date",
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
};
it.each([
  ["date", "2026-11-17", "2026-11-17"],
  ["number", "12.5", 12.5],
  ["json", '{"ok":true}', { ok: true }],
] as const)("uses the row form's typed %s editor", (type, input, expected) => {
  const change = vi.fn();
  render(
    <FieldValueEditor
      field={{ ...field, type }}
      value={undefined}
      members={new Map()}
      onChange={change}
      onInvalidChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Default"), {
    target: { value: input },
  });
  expect(change).toHaveBeenLastCalledWith(expected);
});
it("uses the same choice picker for defaults", async () => {
  function Editor() {
    const [value, setValue] = useState<unknown>(null);
    return (
      <FieldValueEditor
        field={{
          ...field,
          type: "select",
          options: { choices: [{ id: "a", label: "Ready", color: "red" }] },
        }}
        value={value}
        members={new Map()}
        onChange={setValue}
        onInvalidChange={vi.fn()}
      />
    );
  }
  render(<Editor />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(await screen.findByRole("option", { name: "Ready" }));
  expect(screen.getByRole("button")).toHaveTextContent("Ready");
});
it("saves name, typed default, description and required switch", async () => {
  render(
    <FieldOptionsDialog
      organizationId="o"
      tableId="t"
      field={null}
      open
      onOpenChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("navigation:tables.newFieldName"), {
    target: { value: "Due" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.typeDate" }),
  );
  fireEvent.change(
    screen.getByLabelText("navigation:tables.defaultValue", {
      selector: "input",
    }),
    { target: { value: "2026-11-17" } },
  );
  fireEvent.change(
    screen.getByLabelText("navigation:tables.fieldDescription"),
    { target: { value: "Expected delivery" } },
  );
  fireEvent.click(
    screen.getByRole("switch", { name: "navigation:tables.optionRequired" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.addField" }),
  );
  await waitFor(() =>
    expect(createField).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Due",
        type: "date",
        options: {
          defaultValue: "2026-11-17",
          description: "Expected delivery",
          required: true,
        },
      }),
    ),
  );
});
it("blocks invalid defaults and resets them when changing type", async () => {
  render(
    <FieldOptionsDialog
      organizationId="o"
      tableId="t"
      field={null}
      open
      onOpenChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("navigation:tables.newFieldName"), {
    target: { value: "Contact" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.typeEmail" }),
  );
  fireEvent.change(
    screen.getByLabelText("navigation:tables.defaultValue", {
      selector: "input",
    }),
    { target: { value: "invalid" } },
  );
  expect(
    screen.getByRole("button", { name: "navigation:tables.addField" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.typeNumber" }),
  );
  expect(
    screen.getByLabelText("navigation:tables.defaultValue", {
      selector: "input",
    }),
  ).toHaveValue(null);
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.addField" }),
  );
  await waitFor(() =>
    expect(createField).toHaveBeenCalledWith(
      expect.objectContaining({ type: "number", options: {} }),
    ),
  );
});

it("lets explicit group values override defaults", () => {
  render(
    <NewRowDialog
      tableName="Defaults"
      fields={[{ ...field, options: { defaultValue: "2026-11-17" } }]}
      members={new Map()}
      initialValues={{ f: "2026-12-01" }}
      onCreate={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Default", { selector: "input" })).toHaveValue(
    "2026-12-01",
  );
});

it("prefills defaults and help, while clearing stays explicit null", async () => {
  const create = vi.fn().mockResolvedValue({});
  render(
    <NewRowDialog
      tableName="Defaults"
      fields={[
        {
          ...field,
          options: {
            defaultValue: "2026-11-17",
            description: "Expected delivery",
          },
        },
      ]}
      members={new Map()}
      initialValues={{}}
      onCreate={create}
      onOpenChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Default", { selector: "input" })).toHaveValue(
    "2026-11-17",
  );
  expect(screen.getByText("Expected delivery")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Default", { selector: "input" }), {
    target: { value: "" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.createRow" }),
  );
  await waitFor(() => expect(create).toHaveBeenCalledWith({ f: null }));
});
