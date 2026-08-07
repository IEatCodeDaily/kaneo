import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useGetLabelsByOrganization from "./use-get-labels-by-organization";

const getLabels = vi.fn();
vi.mock("@/fetchers/label/get-label-by-organization", () => ({
  default: (...args: unknown[]) => getLabels(...args),
}));

const labels = [
  { id: "native", name: "Native", source: "kaneo" },
  { id: "repo", name: "Repo", source: "repo" },
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("useGetLabelsByOrganization", () => {
  beforeEach(() => getLabels.mockResolvedValue(labels));

  it("hides repo labels unless the caller explicitly opts in", async () => {
    const normal = renderHook(() => useGetLabelsByOrganization("org"), {
      wrapper,
    });
    await waitFor(() =>
      expect(normal.result.current.data).toEqual([labels[0]]),
    );

    const synced = renderHook(
      () => useGetLabelsByOrganization("org", { includeRepo: true }),
      { wrapper },
    );
    await waitFor(() => expect(synced.result.current.data).toEqual(labels));
  });
});
