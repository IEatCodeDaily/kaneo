import { describe, expect, it } from "vitest";
import { type GanttTimeline, weekendTintGradient } from "./gantt-timeline";

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
