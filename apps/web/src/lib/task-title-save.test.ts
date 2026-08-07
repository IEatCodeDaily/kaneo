import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTaskTitleSaver,
  TASK_TITLE_SAVE_DELAY_MS,
} from "./task-title-save";

afterEach(() => {
  vi.useRealTimers();
});

describe("createTaskTitleSaver", () => {
  it("debounces a burst of keystrokes into a single save of the final value", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    for (const value of ["O", "On", "One", "One t", "One two"]) {
      saver.change(value);
      await vi.advanceTimersByTimeAsync(50);
    }

    // Still typing: nothing may reach the API yet.
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS);

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("One two");
  });

  it("waits the full delay after the last keystroke, not the first", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("a");
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    saver.change("ab");
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("ab");
  });

  it("uses a debounce window in the 500-800ms range", () => {
    expect(TASK_TITLE_SAVE_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(TASK_TITLE_SAVE_DELAY_MS).toBeLessThanOrEqual(800);
  });

  it("flushes the pending value immediately (blur / unmount) and only once", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("Final title");
    expect(saver.pending()).toBe(true);

    await saver.flush();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("Final title");
    expect(saver.pending()).toBe(false);

    // The cleared timer must not write the same value a second time.
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not save when nothing is pending", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    await saver.flush();
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
  });

  it("skips the save when the title is typed back to the persisted value", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("Ol");
    saver.change("Old");
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
    expect(saver.pending()).toBe(false);
  });

  it("does not re-save an already persisted value on a later flush", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("New");
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledOnce();

    // Blur after the debounce already saved: must not fire a duplicate write.
    await saver.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(saver.saved()).toBe("New");
  });

  it("keeps the previous baseline when the save fails so the value is retried", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error("network"));
    const saver = createTaskTitleSaver({ save, initialTitle: "Old", onError });

    saver.change("New");
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS);

    expect(onError).toHaveBeenCalledOnce();
    expect(saver.saved()).toBe("Old");

    saver.change("New");
    await vi.advanceTimersByTimeAsync(TASK_TITLE_SAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.saved()).toBe("New");
  });

  it("adopts a server value as the baseline without writing it back", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("Half typed");
    saver.reset("Renamed elsewhere");
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
    expect(saver.saved()).toBe("Renamed elsewhere");
  });

  it("cancels a pending edit without saving it", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const saver = createTaskTitleSaver({ save, initialTitle: "Old" });

    saver.change("discard me");
    saver.cancel();
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
    expect(saver.pending()).toBe(false);
  });
});
