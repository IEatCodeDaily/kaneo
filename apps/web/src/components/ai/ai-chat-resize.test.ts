import { describe, expect, it, vi } from "vitest";

/**
 * The resize handler in ai-chat-bubble coalesces pointermove into one commit
 * per animation frame. This mirrors that loop so the invariant is checkable
 * without mounting the component (the bubble renders null unless the org has
 * AI configured, so it can't be driven in a plain jsdom test).
 *
 * The bug it guards: committing on every pointermove re-renders the whole
 * panel — including chat history — several times per frame.
 */
function makeThrottledCommit(commit: (value: number) => void) {
  let frame = 0;
  let latest = 0;
  return {
    move(value: number) {
      latest = value;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        commit(latest);
      });
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      commit(latest);
    },
  };
}

describe("resize commit throttling", () => {
  it("commits once per frame, not once per pointermove", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const handler = makeThrottledCommit(commit);

    for (let i = 1; i <= 20; i++) handler.move(i);
    expect(commit).not.toHaveBeenCalled(); // nothing before the frame runs

    vi.advanceTimersByTime(32);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(20); // newest value wins

    vi.useRealTimers();
  });

  it("stop() flushes the pending value and cancels the frame", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const handler = makeThrottledCommit(commit);

    handler.move(5);
    handler.stop();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(5);

    // The cancelled frame must not fire a second commit.
    vi.advanceTimersByTime(32);
    expect(commit).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
