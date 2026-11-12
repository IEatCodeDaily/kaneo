import { describe, expect, it, vi } from "vitest";
import { runBoundedSync } from "./repo-sync-flight";

type Result = { issues: number; pullRequests: number };

describe("runBoundedSync", () => {
  it("shares one running sync per repo; a joiner schedules a trailing re-run", async () => {
    let release!: (v: Result) => void;
    const run = vi.fn(
      () =>
        new Promise<Result>((resolve) => {
          release = resolve;
        }),
    );

    const first = runBoundedSync("repo-1", run);
    const second = runBoundedSync("repo-1", run);
    expect(second).toBe(first);

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    release({ issues: 1, pullRequests: 2 });
    await expect(first).resolves.toEqual({ issues: 1, pullRequests: 2 });

    // The joiner's change may have been paginated past: one trailing run.
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("starts a fresh sync after the previous one settles with no joiners", async () => {
    const run = vi.fn(async (): Promise<Result> => ({
      issues: 0,
      pullRequests: 0,
    }));
    await expect(runBoundedSync("repo-fresh", run)).resolves.toEqual({
      issues: 0,
      pullRequests: 0,
    });
    await expect(runBoundedSync("repo-fresh", run)).resolves.toEqual({
      issues: 0,
      pullRequests: 0,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("a failed sync clears the slot so the next caller retries", async () => {
    const failing = vi.fn(async (): Promise<Result> => {
      throw new Error("boom");
    });
    await expect(runBoundedSync("repo-fail", failing)).rejects.toThrow("boom");

    const ok = vi.fn(async (): Promise<Result> => ({
      issues: 3,
      pullRequests: 4,
    }));
    await expect(runBoundedSync("repo-fail", ok)).resolves.toEqual({
      issues: 3,
      pullRequests: 4,
    });
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("concurrent joiners share the first caller's rejection", async () => {
    const run = vi.fn(async (): Promise<Result> => {
      throw new Error("boom");
    });
    const a = runBoundedSync("repo-rej", run);
    const b = runBoundedSync("repo-rej", run);
    expect(b).toBe(a);
    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");
  });

  it("different repo ids do not share a run", async () => {
    let releaseA!: (v: Result) => void;
    const runA = vi.fn(
      () =>
        new Promise<Result>((resolve) => {
          releaseA = resolve;
        }),
    );
    const runB = vi.fn(async (): Promise<Result> => ({
      issues: 2,
      pullRequests: 2,
    }));

    const a = runBoundedSync("repo-a", runA);
    const b = runBoundedSync("repo-b", runB);
    expect(b).not.toBe(a);

    releaseA({ issues: 1, pullRequests: 1 });
    await expect(a).resolves.toEqual({ issues: 1, pullRequests: 1 });
    await expect(b).resolves.toEqual({ issues: 2, pullRequests: 2 });
  });
});
