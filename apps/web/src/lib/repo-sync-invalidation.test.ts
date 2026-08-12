import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateRepoQueries } from "./repo-sync-invalidation";

describe("invalidateRepoQueries", () => {
  it("invalidates every repo-domain query prefix for the synced repo", () => {
    const queryClient = new QueryClient();
    const invalidated: unknown[][] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      invalidated.push((filters?.queryKey ?? []) as unknown[]);
      return Promise.resolve();
    });

    invalidateRepoQueries(queryClient, "repo-1");

    // The repo list is org-scoped, so it is invalidated by prefix.
    expect(invalidated).toContainEqual(["repos"]);
    // Every repo-scoped surface must refetch: header, issue list, PR list,
    // issue/PR detail, contents, tree and metadata.
    for (const prefix of [
      "repo",
      "repo-issues",
      "repo-pull-requests",
      "repo-issue",
      "repo-pull-request",
      "repo-contents",
      "repo-tree",
      "repo-github-metadata",
    ]) {
      expect(invalidated).toContainEqual([prefix, "repo-1"]);
    }
  });

  it("falls back to bare prefixes when no repo id is known", () => {
    const queryClient = new QueryClient();
    const invalidated: unknown[][] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      invalidated.push((filters?.queryKey ?? []) as unknown[]);
      return Promise.resolve();
    });

    invalidateRepoQueries(queryClient);

    expect(invalidated).toContainEqual(["repos"]);
    expect(invalidated).toContainEqual(["repo-issues"]);
    expect(invalidated).toContainEqual(["repo-pull-requests"]);
  });
});
