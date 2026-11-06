import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { useSidebarWidth } from "./sidebar-resize-handle";

describe("useSidebarWidth", () => {
  afterEach(() => useUserPreferencesStore.setState({ sidebarWidth: null }));

  it("returns the saved width on the first render, so a page change that remounts the layout does not flash the default width", () => {
    useUserPreferencesStore.setState({ sidebarWidth: 320 });
    const seen: Array<string | undefined> = [];
    renderHook(() => {
      const width = useSidebarWidth();
      seen.push(width);
      return width;
    });
    expect(seen[0]).toBe("320px");
    expect(seen.every((width) => width === "320px")).toBe(true);
  });

  it("uses the CSS default when the sidebar was never resized", () => {
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current).toBeUndefined();
  });
});
