import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateProjectQueries } from "./project-sync-invalidation";

describe("invalidateProjectQueries", () => {
  it("invalidates the projects list, project detail, and sidebar query families for the given project", () => {
    const queryClient = new QueryClient();
    const invalidated: unknown[][] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      invalidated.push((filters?.queryKey ?? []) as unknown[]);
      return Promise.resolve();
    });

    invalidateProjectQueries(queryClient, "project-1");

    expect(invalidated).toContainEqual(["projects"]);
    expect(invalidated).toContainEqual(["project", "project-1"]);
    expect(invalidated).toContainEqual(["sidebar"]);
  });

  it("falls back to the bare project prefix when no project id is known", () => {
    const queryClient = new QueryClient();
    const invalidated: unknown[][] = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters) => {
      invalidated.push((filters?.queryKey ?? []) as unknown[]);
      return Promise.resolve();
    });

    invalidateProjectQueries(queryClient);

    expect(invalidated).toContainEqual(["projects"]);
    expect(invalidated).toContainEqual(["project"]);
    expect(invalidated).toContainEqual(["sidebar"]);
  });
});
