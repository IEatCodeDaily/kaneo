import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import deleteNotification from "@/fetchers/notification/delete-notification";
import type { Notification } from "@/types/notification";
import useDeleteNotification from "./use-delete-notification";

vi.mock("@/fetchers/notification/delete-notification", () => ({
  default: vi.fn(),
}));

const item = (id: string) => ({ id }) as Notification;

describe("useDeleteNotification", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["notifications"], [item("one"), item("two")]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return {
      queryClient,
      ...renderHook(() => useDeleteNotification(), { wrapper }),
    };
  }

  it("optimistically removes an individual notification", async () => {
    vi.mocked(deleteNotification).mockResolvedValue(undefined);
    const { result, queryClient } = setup();
    act(() => result.current.mutate(["one"]));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<Notification[]>(["notifications"]),
      ).toEqual([item("two")]),
    );
    expect(deleteNotification).toHaveBeenCalledWith("one");
  });

  it("removes a group and rolls back on failure", async () => {
    vi.mocked(deleteNotification).mockRejectedValue(new Error("nope"));
    const { result, queryClient } = setup();
    act(() => result.current.mutate(["one", "two"]));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<Notification[]>(["notifications"])).toEqual(
      [item("one"), item("two")],
    );
  });
});
