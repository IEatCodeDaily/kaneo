import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { legacyViewConfig } from "@/components/data-table/saved-view-layout";
import {
  getTableViews,
  updateTableView,
} from "@/fetchers/data-table/data-table";
import { useTableViews } from "./use-table-views";

vi.mock("@/fetchers/data-table/data-table", () => ({
  getTableViews: vi.fn(),
  updateTableView: vi.fn(),
  getDataTable: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});
function mount(canEdit: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  vi.mocked(getTableViews).mockResolvedValue([
    {
      id: "default",
      name: "Default",
      isDefault: true,
      config: legacyViewConfig("table"),
    },
  ]);
  return renderHook(() => useTableViews("org", "table", canEdit), { wrapper });
}
it("viewers keep separate local layouts without issuing writes", async () => {
  const { result } = mount(false);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const tall = { ...legacyViewConfig("table"), rowHeight: "tall" as const };
  act(() => {
    result.current.change("default", tall);
    result.current.change("other", legacyViewConfig("table"));
  });
  await act(async () => {
    expect(await result.current.flush()).toBe(true);
  });
  expect(updateTableView).not.toHaveBeenCalled();
  expect(result.current.local.default).toEqual(tall);
  expect(result.current.local.other.rowHeight).toBe("compact");
});
it("failed autosaves retain the latest layout and retry instead of silently dropping edits", async () => {
  const { result } = mount(true);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const config = { ...legacyViewConfig("table"), frozenColumns: 2 };
  vi.mocked(updateTableView).mockRejectedValueOnce(new Error("offline"));
  act(() => result.current.change("default", config));
  await act(async () => {
    expect(await result.current.flush()).toBe(false);
  });
  expect(result.current.saveError).toBe(true);
  expect(result.current.local.default).toEqual(config);
  vi.mocked(updateTableView).mockResolvedValue({
    id: "default",
    name: "Default",
    isDefault: true,
    config,
  });
  await act(async () => {
    expect(await result.current.flush()).toBe(true);
  });
  expect(updateTableView).toHaveBeenLastCalledWith(
    { organizationId: "org", tableId: "table" },
    "default",
    { config },
  );
  expect(result.current.saveError).toBe(false);
});
it("an edit arriving during a save is sent after it, never overwritten by its older response", async () => {
  const { result } = mount(true);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  let release!: () => void;
  const first = { ...legacyViewConfig("table"), frozenColumns: 1 };
  const next = { ...first, frozenColumns: 2 };
  vi.mocked(updateTableView)
    .mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { id: "default", name: "Default", isDefault: true, config: first };
    })
    .mockResolvedValue({
      id: "default",
      name: "Default",
      isDefault: true,
      config: next,
    });
  act(() => result.current.change("default", first));
  let saving!: Promise<boolean>;
  act(() => {
    saving = result.current.flush();
  });
  await waitFor(() => expect(updateTableView).toHaveBeenCalledTimes(1));
  act(() => result.current.change("default", next));
  await act(async () => {
    release();
    await saving;
    await result.current.flush();
  });
  expect(updateTableView).toHaveBeenLastCalledWith(
    { organizationId: "org", tableId: "table" },
    "default",
    { config: next },
  );
  expect(result.current.local.default).toEqual(next);
});
