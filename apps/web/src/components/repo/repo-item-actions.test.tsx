import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoItemHeaderActions } from "./repo-item-actions";

const mocks = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => `http://api.test${path}`,
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

describe("RepoItemHeaderActions", () => {
  // Without cleanup the closed-issue render leaks into the next case, so the
  // "open issue" assertion would still find the previous Reopen button.
  afterEach(cleanup);

  it("reopens a closed issue through the dedicated endpoint and refreshes its query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <RepoItemHeaderActions
          kind="issue"
          number={29}
          repoId="repo-1"
          state="closed"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reopen GitHub Issue" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://api.test/repo/repo-1/issues/29/reopen",
        expect.objectContaining({
          credentials: "include",
          method: "POST",
        }),
      );
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["repo-issue", "repo-1", 29],
      });
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Issue reopened on GitHub.",
    );
    vi.unstubAllGlobals();
  });

  it("only exposes the reopen action for closed issues", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <RepoItemHeaderActions
          kind="issue"
          number={29}
          repoId="repo-1"
          state="open"
        />
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Reopen GitHub Issue" }),
    ).not.toBeInTheDocument();
  });
});
