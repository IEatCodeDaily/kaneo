import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  DATA_TABLE_FIELD_TYPES,
  type DataTableField,
} from "@/types/data-table";

vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

import { NewRowDialog } from "./new-row-dialog";

const fields: DataTableField[] = DATA_TABLE_FIELD_TYPES.filter(
  (type) => type !== "link",
).map((type, position) => ({
  id: type,
  tableId: "t",
  name: type,
  type,
  position,
  createdAt: "",
  updatedAt: "",
  options: {
    required: type === "text",
    choices: [{ id: "a", label: "Ready", color: "red" }],
  },
}));
const mount = (
  onCreate = vi.fn().mockResolvedValue(undefined),
  onOpenChange = vi.fn(),
) => {
  render(
    <NewRowDialog
      tableName="Samples"
      fields={fields}
      members={new Map()}
      initialValues={{}}
      onCreate={onCreate}
      onOpenChange={onOpenChange}
    />,
  );
  return { onCreate, onOpenChange };
};
afterEach(cleanup);

it("renders every field in order with its shared editor, focusing the first", async () => {
  mount();
  // Lookup values resolve server-side: the form never renders an editor for it.
  expect(
    screen.getAllByRole("group").map((node) => node.getAttribute("aria-label")),
  ).toEqual(
    fields.filter((field) => field.type !== "lookup").map((field) => field.name),
  );
  expect(screen.queryByRole("group", { name: "lookup" })).toBeNull();
  for (const type of [
    "text",
    "longtext",
    "number",
    "percent",
    "currency",
    "date",
    "datetime",
    "url",
    "email",
    "json",
  ]) {
    expect(
      screen.getByLabelText(type, { selector: "input, textarea" }),
    ).toBeInTheDocument();
  }
  for (const type of ["select", "multiselect", "user", "ticket"]) {
    expect(
      within(screen.getByRole("group", { name: type })).getByRole("button"),
    ).toBeInTheDocument();
  }
  expect(screen.getByRole("checkbox")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByLabelText("text", { selector: "input, textarea" }),
    ).toHaveFocus(),
  );
});

it("blocks required and invalid values, then creates once with typed values including the focused draft", async () => {
  const { onCreate, onOpenChange } = mount();
  const submit = () => {
    const form = screen
      .getByRole("button", { name: "navigation:tables.createRow" })
      .closest("form");
    if (!form) throw new Error("create row form not found");
    fireEvent.submit(form);
  };
  submit();
  expect(onCreate).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "navigation:tables.requiredField",
  );
  fireEvent.change(
    screen.getByLabelText("text", { selector: "input, textarea" }),
    { target: { value: "New sample" } },
  );
  fireEvent.change(
    screen.getByLabelText("email", { selector: "input, textarea" }),
    { target: { value: "invalid" } },
  );
  submit();
  expect(onCreate).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByLabelText("email", { selector: "input, textarea" }),
    { target: { value: "ada@example.com" } },
  );
  fireEvent.change(
    screen.getByLabelText("number", { selector: "input, textarea" }),
    { target: { value: "12.5" } },
  );
  fireEvent.change(
    screen.getByLabelText("json", { selector: "input, textarea" }),
    { target: { value: '{"ok":true}' } },
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    within(screen.getByRole("group", { name: "select" })).getByRole("button"),
  );
  fireEvent.click(await screen.findByRole("option", { name: "Ready" }));
  fireEvent.keyDown(
    screen.getByLabelText("text", { selector: "input, textarea" }),
    { key: "Enter" },
  );
  await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  expect(onCreate).toHaveBeenCalledWith({
    text: "New sample",
    email: "ada@example.com",
    number: 12.5,
    json: { ok: true },
    checkbox: true,
    select: "a",
  });
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("keeps entered values and the server error on failure", async () => {
  const { onOpenChange } = mount(
    vi.fn().mockRejectedValue(new Error("Permission changed")),
  );
  fireEvent.change(
    screen.getByLabelText("text", { selector: "input, textarea" }),
    { target: { value: "Keep me" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.createRow" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Permission changed",
  );
  expect(
    screen.getByLabelText("text", { selector: "input, textarea" }),
  ).toHaveValue("Keep me");
  expect(onOpenChange).not.toHaveBeenCalled();
});
