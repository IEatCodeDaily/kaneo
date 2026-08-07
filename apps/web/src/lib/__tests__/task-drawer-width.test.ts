import { describe, expect, it } from "vitest";
import {
  clampTaskDrawerWidth,
  maxTaskDrawerWidth,
  parseStoredTaskDrawerWidth,
  TASK_DRAWER_DEFAULT_WIDTH,
  TASK_DRAWER_MIN_WIDTH,
  widthFromPointer,
} from "@/lib/task-drawer-width";

/**
 * #112 "Make Task modal resizeable".
 *
 * The clamping/parsing rules are the part that actually breaks in use — a
 * width saved on a wide monitor, a hand-edited localStorage value, a drag past
 * the edge of the screen. Tested as a pure module so each rule is pinned
 * without mounting the sheet.
 */

const VIEWPORT = 1440;

describe("clampTaskDrawerWidth (#112)", () => {
  it("keeps a sensible width untouched", () => {
    expect(clampTaskDrawerWidth(900, VIEWPORT)).toBe(900);
  });

  it("refuses to shrink below the minimum usable width", () => {
    expect(clampTaskDrawerWidth(50, VIEWPORT)).toBe(TASK_DRAWER_MIN_WIDTH);
  });

  it("never lets the drawer swallow the whole viewport", () => {
    const clamped = clampTaskDrawerWidth(99999, VIEWPORT);
    expect(clamped).toBe(maxTaskDrawerWidth(VIEWPORT));
    expect(clamped).toBeLessThan(VIEWPORT);
  });

  it("survives a viewport narrower than the minimum without inverting", () => {
    // A 320px phone: max would compute below min, which would invert the
    // clamp range and produce nonsense.
    const clamped = clampTaskDrawerWidth(500, 320);
    expect(clamped).toBe(TASK_DRAWER_MIN_WIDTH);
  });

  it("falls back to the default for a non-finite width", () => {
    expect(clampTaskDrawerWidth(Number.NaN, VIEWPORT)).toBe(
      TASK_DRAWER_DEFAULT_WIDTH,
    );
  });
});

describe("parseStoredTaskDrawerWidth (#112)", () => {
  it("restores a previously saved width", () => {
    expect(parseStoredTaskDrawerWidth("880", VIEWPORT)).toBe(880);
  });

  it("uses the default when nothing has been saved", () => {
    expect(parseStoredTaskDrawerWidth(null, VIEWPORT)).toBe(
      TASK_DRAWER_DEFAULT_WIDTH,
    );
  });

  it("ignores garbage in localStorage instead of rendering a broken drawer", () => {
    expect(parseStoredTaskDrawerWidth("not-a-number", VIEWPORT)).toBe(
      TASK_DRAWER_DEFAULT_WIDTH,
    );
  });

  it("re-clamps a width saved on a much wider monitor", () => {
    // Saved at 2400px on an ultrawide, reopened on a 1440px laptop.
    expect(parseStoredTaskDrawerWidth("2400", VIEWPORT)).toBe(
      maxTaskDrawerWidth(VIEWPORT),
    );
  });
});

describe("widthFromPointer (#112)", () => {
  it("widens the drawer as the pointer moves left", () => {
    // Right-anchored: width is the distance from pointer to the right edge.
    expect(widthFromPointer(640, VIEWPORT)).toBe(800);
    expect(widthFromPointer(540, VIEWPORT)).toBe(900);
  });

  it("clamps a drag past the left edge of the screen", () => {
    expect(widthFromPointer(-200, VIEWPORT)).toBe(maxTaskDrawerWidth(VIEWPORT));
  });

  it("clamps a drag past the right edge", () => {
    expect(widthFromPointer(VIEWPORT + 100, VIEWPORT)).toBe(
      TASK_DRAWER_MIN_WIDTH,
    );
  });
});
