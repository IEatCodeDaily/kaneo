import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  type GanttTimeline,
  gridLineGradient,
  weekendTintGradient,
} from "./gantt-timeline";

/** Minimal timeline stub — the gradient only reads days + dayWidthRem. */
function tl(startISO: string, count: number, dayWidthRem = 2): GanttTimeline {
  const start = new Date(`${startISO}T00:00:00`);
  const days = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  return {
    days,
    dayWidthRem,
    rangeStart: days[0],
  } as unknown as GanttTimeline;
}

/** The tint expression the gradient uses for weekend bands. */
const TINT = "color-mix(in srgb, var(--foreground) 5%, transparent)";

/** Pull the shaded band offsets (in rem) out of the generated gradient. */
function bands(css: string) {
  // Match the literal tint followed by its stop. A generic paren-matching regex
  // trips over the nested var(--foreground) inside color-mix().
  const escaped = TINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stops = [
    ...css.matchAll(new RegExp(`${escaped}\\s+(-?[\\d.]+)rem`, "g")),
  ].map((m) => Number(m[1]));
  return { start: stops[0], end: stops[1] };
}

describe("weekendTintGradient", () => {
  it("returns null when the range contains no Saturday", () => {
    // Mon 2026-07-13 .. Fri 2026-07-17
    expect(weekendTintGradient(tl("2026-07-13", 5))).toBeNull();
  });

  it("anchors the band so it lands on the first Saturday", () => {
    // Mon 2026-07-13 -> first Saturday is index 5.
    const css = weekendTintGradient(tl("2026-07-13", 14, 2));
    expect(css).not.toBeNull();
    const { start, end } = bands(css as string);
    // Period origin is 7 days before that Saturday; the first painted band
    // therefore begins exactly at the Saturday and spans 2 days.
    expect(start).toBe(5 * 2);
    expect(end).toBe(7 * 2);
  });

  it("still paints when the range opens on a Saturday", () => {
    // Sat 2026-07-18 at index 0 — the naive origin would be 0 and clip the band.
    const css = weekendTintGradient(tl("2026-07-18", 10, 2));
    expect(css).not.toBeNull();
    const { start, end } = bands(css as string);
    expect(start).toBe(0);
    expect(end).toBe(2 * 2);
  });

  it("repeats on a 7-day period", () => {
    const css = weekendTintGradient(tl("2026-07-13", 14, 2)) as string;
    expect(css).toContain("repeating-linear-gradient");
    // One period = 7 days wide: band end (14rem) - period origin (-2rem) = 16rem? No:
    // origin is (5-7)*2 = -4rem, and the band ends at 14rem => 18rem total is
    // two periods; the repeat unit itself is the 7*2=14rem stride.
    const origin = Number(
      (css.match(/transparent (-?[\d.]+)rem/) as RegExpMatchArray)[1],
    );
    expect(origin).toBe(-4);
  });
});

describe("buildTimeline horizon", () => {
  const args = {
    earliest: new Date("2026-07-20T00:00:00"),
    latest: new Date("2026-08-10T00:00:00"),
    isMobile: false,
    weekStartsOn: 0 as const,
  };

  it("gives month zoom a horizon far past the last task", () => {
    // The bug: month zoom used a fixed 28-day tail, so zooming out showed only
    // a few months and there was nowhere to drag a bar to.
    const day = buildTimeline({ ...args, zoom: "day" });
    const month = buildTimeline({ ...args, zoom: "month" });

    const lastDay = (t: GanttTimeline) => t.days[t.days.length - 1];
    expect(lastDay(month).getTime()).toBeGreaterThan(lastDay(day).getTime());
    // At least a year of runway past the final task.
    const daysPastLatest =
      (lastDay(month).getTime() - args.latest.getTime()) / 86_400_000;
    expect(daysPastLatest).toBeGreaterThan(360);
  });

  it("labels month zoom by week-of-month, not by year", () => {
    const month = buildTimeline({ ...args, zoom: "month" });
    const labels = month.headerCells.map((c) => c.label);
    // Every label is a W1..W6 marker, and W1 really occurs (the old
    // start-day numbering skipped it for most months).
    expect(labels.every((l) => /^W[1-6]$/.test(l))).toBe(true);
    expect(labels).toContain("W1");
    // Week groups, so cells span 7 days (except a clipped first/last).
    expect(month.headerCells.some((c) => c.span === 7)).toBe(true);
  });

  it("keeps day zoom labelled by day number", () => {
    const day = buildTimeline({ ...args, zoom: "day" });
    expect(day.headerCells.every((c) => c.span === 1)).toBe(true);
    expect(day.headerCells[0].sublabel).toMatch(/^\d+$/);
  });
});

/**
 * #163: the grid was painted only at day zoom, so changing zoom made it vanish
 * and reappear. It must be drawable at every zoom, at a readable density.
 */
describe("#163 gridLineGradient at every zoom", () => {
  /** Period, in rem, between painted grid lines. */
  function period(css: string) {
    const stops = [...css.matchAll(/([\d.]+)rem/g)].map((m) => Number(m[1]));
    return Math.max(...stops);
  }

  it("draws a line per day while day columns are wide", () => {
    const wide = tl("2026-07-13", 30, 2.75);
    expect(period(gridLineGradient(wide))).toBeCloseTo(2.75, 5);
  });

  // The regression: month zoom uses 0.375rem columns (~6px). A line every day
  // there is hatching, not a grid, so it must widen to a weekly cadence.
  it("falls back to a weekly line when columns are narrow", () => {
    const narrow = tl("2026-07-13", 30, 0.375);
    expect(period(gridLineGradient(narrow))).toBeCloseTo(0.375 * 7, 5);
  });

  // NEGATIVE CONTROL: a gradient must actually be produced at every zoom,
  // otherwise the assertions above could pass on an empty/none background.
  it("always produces a repeating gradient", () => {
    for (const width of [2.75, 1, 0.375]) {
      const css = gridLineGradient(tl("2026-07-13", 30, width));
      expect(css).toContain("repeating-linear-gradient");
      expect(css).not.toBe("none");
    }
  });
});
