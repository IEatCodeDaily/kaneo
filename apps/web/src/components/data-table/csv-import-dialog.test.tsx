import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CsvImportResult } from "@/fetchers/data-table/data-table";
import type { DataTableField } from "@/types/data-table";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/fetchers/data-table/data-table", () => ({
  importTableCsv: request,
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      `${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
  }),
}));

import { CsvImportDialog } from "./csv-import-dialog";

const fields: DataTableField[] = [
  {
    id: "name",
    tableId: "table",
    name: "Name",
    type: "text",
    position: 0,
    options: null,
    createdAt: "",
    updatedAt: "",
  },
];
const setup = () => {
  const onImported = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <CsvImportDialog
      csv={"Name\none\ntwo"}
      fields={fields}
      target={{ organizationId: "org", tableId: "table" }}
      onClose={onClose}
      onImported={onImported}
    />,
  );
  return { onImported, onClose };
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("cancels between batches without losing the current batch's confirmed result", async () => {
  request.mockResolvedValueOnce({
    created: 0,
    checked: 100,
    total: 100,
    errors: [],
  });
  const { onImported, onClose } = setup();
  expect(
    screen.getByRole("button", { name: "navigation:tables.csvImport" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.csvValidate" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "navigation:tables.csvImport" }),
    ).toBeEnabled(),
  );
  let finish: (result: CsvImportResult) => void = () => {};
  request.mockImplementationOnce(
    () =>
      new Promise<CsvImportResult>((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.csvImport" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "navigation:tables.csvCancel" }),
  );
  expect(onClose).not.toHaveBeenCalled();
  finish({ created: 50, checked: 50, total: 100, errors: [] });
  await screen.findByText("navigation:tables.csvCancelled");
  expect(
    screen.getByText('navigation:tables.csvCreated {"count":50}'),
  ).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(2);
  expect(onImported).toHaveBeenCalledOnce();
});
it("sums committed batches and retains all failed source lines in the completion summary", async () => {
  request.mockResolvedValueOnce({
    created: 0,
    checked: 100,
    total: 100,
    errors: [],
  });
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.csvValidate" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "navigation:tables.csvImport" }),
    ).toBeEnabled(),
  );
  request
    .mockResolvedValueOnce({ created: 50, checked: 50, total: 100, errors: [] })
    .mockResolvedValueOnce({
      created: 0,
      checked: 50,
      total: 100,
      errors: [{ line: 73, field: "Name", message: "Invalid" }],
    });
  fireEvent.click(
    screen.getByRole("button", { name: "navigation:tables.csvImport" }),
  );
  await screen.findByText("navigation:tables.csvComplete");
  expect(
    screen.getByText('navigation:tables.csvCreated {"count":50}'),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent('"line":73');
  expect(request.mock.calls[2][1]).toMatchObject({
    offset: 50,
    preview: false,
  });
});
