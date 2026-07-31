import { afterEach, describe, expect, it, vi } from "vitest";
import debounce from "./debounce";

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("coalesces calls and runs only the latest arguments after the delay", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const debounced = debounce(save, 800);

    debounced("first");
    debounced("final");
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("final");
  });

  it("flushes the final pending call immediately before navigation", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const debounced = debounce(save, 800);

    debounced("draft with final keystroke");
    expect(debounced.pending()).toBe(true);

    await debounced.flush();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("draft with final keystroke");
    expect(debounced.pending()).toBe(false);

    // The cleared timer must not save the same draft twice later.
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledOnce();
  });

  it("can cancel a pending call without running it", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const debounced = debounce(save, 800);

    debounced("discard me");
    debounced.cancel();
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
    expect(debounced.pending()).toBe(false);
  });
});
