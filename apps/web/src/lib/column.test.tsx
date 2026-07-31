import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getColumnIcon } from "./column";

afterEach(cleanup);

const circlesOf = (svg: SVGElement) =>
  Array.from(svg.querySelectorAll("circle")).map((c) => ({
    r: Number(c.getAttribute("r")),
    fill: c.getAttribute("fill"),
    stroke: c.getAttribute("stroke"),
  }));

const svgOf = (node: HTMLElement) => {
  const svg = node.querySelector("svg");
  if (!svg) throw new Error("no svg rendered");
  return svg;
};

/**
 * The done column used a check-in-a-circle, which at 16px did not read as
 * "complete" (#64). It is now the in-progress dot taken nearly all the way: a
 * large fill with a visible gap left between fill and outline.
 */
describe("getColumnIcon done state", () => {
  it("renders the final column as a nearly-filled circle, not a checkmark", () => {
    const { container } = render(getColumnIcon("done", true, null));
    const svg = svgOf(container);

    const circles = circlesOf(svg);
    const outline = circles.find((c) => c.fill === null || c.fill === "none");
    const fill = circles.find((c) => c.fill === "currentColor");

    expect(outline, "expected an unfilled outline circle").toBeTruthy();
    expect(fill, "expected a filled inner circle").toBeTruthy();

    // Nearly filled, but with a real ring of background still showing.
    expect(fill?.r).toBeGreaterThan((outline?.r ?? 0) * 0.5);
    expect(fill?.r).toBeLessThan(outline?.r ?? 0);

    // A check glyph is a polyline/path, never part of the filled-circle shape.
    expect(svg.querySelector("polyline")).toBeNull();
    expect(svg.querySelector("path")).toBeNull();
  });

  it("uses the filled circle for a column explicitly configured as CheckCircle2", () => {
    const { container } = render(
      getColumnIcon("shipped", true, "CheckCircle2"),
    );
    const svg = svgOf(container);
    expect(svg.querySelector("path")).toBeNull();
    expect(circlesOf(svg).some((c) => c.fill === "currentColor")).toBe(true);
  });

  it("leaves the non-final statuses alone", () => {
    // in-progress stays the small dot inside a ring.
    const { container: progress } = render(
      getColumnIcon("in-progress", false, null),
    );
    const progressFill = circlesOf(svgOf(progress)).find(
      (c) => c.fill === "currentColor",
    );
    // lucide's CircleDot draws its dot as a small circle, nothing near-full.
    expect((progressFill?.r ?? 0) < 5).toBe(true);

    // to-do stays an empty ring: no filled circle at all.
    const { container: todo } = render(getColumnIcon("to-do", false, null));
    expect(circlesOf(svgOf(todo)).some((c) => c.fill === "currentColor")).toBe(
      false,
    );
  });
});
