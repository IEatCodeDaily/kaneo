import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useUserPreferencesStore } from "@/store/user-preferences";
import {
  REDUCE_OVERLAY_BLUR_CLASS,
  useUserPreferencesEffects,
} from "../use-user-preferences-effects";

/**
 * #125: the blur behind modals/sheets is opt-out via a per-account preference.
 *
 * The preference drives a root class rather than a prop on each overlay, so
 * these assert the observable outcome: the class lands on <html> and the CSS
 * that class keys off actually disables the filter on all four overlay
 * primitives.
 */
describe("#125 reduce overlay blur preference", () => {
  beforeEach(() => {
    useUserPreferencesStore.setState({ reduceOverlayBlur: false });
    document.documentElement.className = "";
  });

  afterEach(() => {
    document.documentElement.className = "";
  });

  it("is off by default, so the blur is unchanged for existing users", () => {
    renderHook(() => useUserPreferencesEffects());
    expect(
      document.documentElement.classList.contains(REDUCE_OVERLAY_BLUR_CLASS),
    ).toBe(false);
  });

  it("adds the root class when enabled", () => {
    useUserPreferencesStore.setState({ reduceOverlayBlur: true });
    renderHook(() => useUserPreferencesEffects());
    expect(
      document.documentElement.classList.contains(REDUCE_OVERLAY_BLUR_CLASS),
    ).toBe(true);
  });

  it("removes the class again when switched back off", () => {
    useUserPreferencesStore.setState({ reduceOverlayBlur: true });
    const { rerender } = renderHook(() => useUserPreferencesEffects());
    expect(
      document.documentElement.classList.contains(REDUCE_OVERLAY_BLUR_CLASS),
    ).toBe(true);

    useUserPreferencesStore.setState({ reduceOverlayBlur: false });
    rerender();
    expect(
      document.documentElement.classList.contains(REDUCE_OVERLAY_BLUR_CLASS),
    ).toBe(false);
  });

  it("does not disturb the unrelated compact-mode class", () => {
    useUserPreferencesStore.setState({
      reduceOverlayBlur: true,
      compactMode: true,
    });
    renderHook(() => useUserPreferencesEffects());
    expect(document.documentElement.classList.contains("compact-mode")).toBe(
      true,
    );
    useUserPreferencesStore.setState({ compactMode: false });
  });
});

/**
 * The stylesheet is the generated artifact this preference targets, so
 * asserting its rule is checking a contract between two files rather than
 * grepping application logic: every overlay primitive that sets a blur must be
 * covered, otherwise enabling the preference silently misses one surface.
 */
describe("#125 stylesheet covers every blurred overlay", () => {
  // vitest runs with apps/web as the root (see vitest.config.ts).
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("disables the backdrop filter under the root class", () => {
    expect(css).toContain(".reduce-overlay-blur");
    expect(css).toMatch(/backdrop-filter:\s*none/);
  });

  it.each([
    "dialog-backdrop",
    "sheet-backdrop",
    "alert-dialog-backdrop",
    "command-dialog-backdrop",
  ])("covers %s", (slot) => {
    expect(css).toContain(`.reduce-overlay-blur [data-slot="${slot}"]`);
  });
});
