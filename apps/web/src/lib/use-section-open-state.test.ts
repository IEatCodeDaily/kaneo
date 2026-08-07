import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSectionOpenState } from "./use-section-open-state";

afterEach(cleanup);

/**
 * Subtask/relation sections used to hardcode `useState(true)`, so every task
 * opened with two empty accordions taking up vertical space (#73).
 */
describe("useSectionOpenState", () => {
  it("starts collapsed when the first loaded payload is empty", () => {
    const { result } = renderHook(() => useSectionOpenState(false, true));
    expect(result.current[0]).toBe(false);
  });

  it("starts expanded when the first loaded payload has items", () => {
    const { result } = renderHook(() => useSectionOpenState(true, true));
    expect(result.current[0]).toBe(true);
  });

  it("latches the default from the first load, not from later data changes", () => {
    const { result, rerender } = renderHook(
      ({ hasItems, isLoaded }: { hasItems: boolean; isLoaded: boolean }) =>
        useSectionOpenState(hasItems, isLoaded),
      { initialProps: { hasItems: false, isLoaded: false } },
    );

    // Nothing loaded yet: no flash of an expanded empty section.
    expect(result.current[0]).toBe(false);

    // First load says empty -> collapsed.
    rerender({ hasItems: false, isLoaded: true });
    expect(result.current[0]).toBe(false);

    // User opens the section to add the first item.
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);

    // The item lands. A naive effect keyed on the data would re-run here and
    // fight the user; the section must stay exactly as they left it.
    rerender({ hasItems: true, isLoaded: true });
    expect(result.current[0]).toBe(true);

    // ...and removing the last item must not slam it shut either.
    rerender({ hasItems: false, isLoaded: true });
    expect(result.current[0]).toBe(true);
  });

  it("lets the user collapse a populated section and keeps it collapsed", () => {
    const { result, rerender } = renderHook(
      ({ hasItems }: { hasItems: boolean }) =>
        useSectionOpenState(hasItems, true),
      { initialProps: { hasItems: true } },
    );
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    rerender({ hasItems: true });
    expect(result.current[0]).toBe(false);
  });
});
