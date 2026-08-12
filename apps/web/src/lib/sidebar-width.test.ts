import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  parseStoredSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  sidebarWidthFromPointer,
} from "./sidebar-width";

describe("clampSidebarWidth", () => {
  it("passes through widths inside the range", () => {
    expect(clampSidebarWidth(300, 1920)).toBe(300);
  });

  it("enforces the minimum", () => {
    expect(clampSidebarWidth(50, 1920)).toBe(SIDEBAR_MIN_WIDTH_PX);
  });

  it("enforces the hard maximum on huge viewports", () => {
    expect(clampSidebarWidth(2000, 3840)).toBe(SIDEBAR_MAX_WIDTH_PX);
  });

  it("caps at 40% of the viewport when that is below the hard max", () => {
    // 40% of 1000 = 400 < 480
    expect(clampSidebarWidth(2000, 1000)).toBe(400);
  });

  it("never inverts the clamp range on narrow viewports", () => {
    /*
      40% of 400 = 160, which is BELOW the 192 minimum. A naive
      min(max(w, MIN), ratioMax) returns 160 — smaller than the minimum.
      The minimum must win.
    */
    expect(clampSidebarWidth(300, 400)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(clampSidebarWidth(100, 400)).toBe(SIDEBAR_MIN_WIDTH_PX);
  });

  it("rounds fractional widths", () => {
    expect(clampSidebarWidth(300.7, 1920)).toBe(301);
  });
});

describe("parseStoredSidebarWidth", () => {
  it("re-clamps a width saved on an ultrawide against the current viewport", () => {
    // saved 480 on a 4k screen, reopened on a 1000px laptop → 40% cap = 400
    expect(parseStoredSidebarWidth(480, 1000)).toBe(400);
  });

  it("falls back to the default for garbage storage", () => {
    for (const garbage of [null, undefined, "banana", Number.NaN, {}, ""]) {
      expect(parseStoredSidebarWidth(garbage, 1920)).toBe(
        SIDEBAR_DEFAULT_WIDTH_PX,
      );
    }
  });

  it("accepts numeric strings (old storage formats)", () => {
    expect(parseStoredSidebarWidth("320", 1920)).toBe(320);
  });
});

describe("sidebarWidthFromPointer", () => {
  it("left-anchored: width equals pointer x (drag right grows)", () => {
    expect(sidebarWidthFromPointer(350, 1920)).toBe(350);
    // dragging further right widens — direction sanity, not just legality
    expect(sidebarWidthFromPointer(360, 1920)).toBeGreaterThan(
      sidebarWidthFromPointer(300, 1920),
    );
  });

  it("clamps pointer positions past the limits", () => {
    expect(sidebarWidthFromPointer(5, 1920)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(sidebarWidthFromPointer(1900, 1920)).toBe(SIDEBAR_MAX_WIDTH_PX);
  });
});
