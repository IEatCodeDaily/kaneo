import { describe, expect, it } from "vitest";
import {
  clampPan,
  computeInitialTransform,
  cropRectFromTransform,
  MIN_ZOOM,
} from "./avatar-crop";

const IMG = { width: 4000, height: 3000 };
const SMALL = { width: 300, height: 200 };

describe("computeInitialTransform", () => {
  it("scales the image to cover the viewport (zoom >= 1)", () => {
    // viewport 256; image 4000x3000 -> cover scale = 256/3000 < 1, clamped to 1
    const t = computeInitialTransform(IMG, 256);
    expect(t.scale).toBe(1);
    // image centered: x = (256 - 4000*1)/2
    expect(t.x).toBe((256 - 4000) / 2);
    expect(t.y).toBe((256 - 3000) / 2);
  });

  it("zooms up a small image to cover instead of letterboxing", () => {
    const t = computeInitialTransform(SMALL, 256);
    // cover scale = 256/200 = 1.28
    expect(t.scale).toBeCloseTo(256 / 200, 5);
    expect(t.x).toBeCloseTo((256 - 300 * 1.28) / 2, 5);
    expect(t.y).toBe(0);
  });

  it("never returns a zoom below MIN_ZOOM", () => {
    const t = computeInitialTransform({ width: 10000, height: 8000 }, 256);
    expect(t.scale).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});

describe("clampPan", () => {
  it("keeps the image covering the viewport when zoomed in", () => {
    // image 4000px wide at scale 1 in a 256 viewport: x must be in
    // [256-4000, 0]
    expect(clampPan(-100, 4000, 256)).toBe(-100);
    expect(clampPan(50, 4000, 256)).toBe(0);
    expect(clampPan(-5000, 4000, 256)).toBe(256 - 4000);
  });

  it("pins a cover-sized image exactly (no slack)", () => {
    // rendered size == viewport -> only 0 is valid
    expect(clampPan(10, 256, 256)).toBe(0);
    expect(clampPan(-10, 256, 256)).toBe(0);
  });
});

describe("cropRectFromTransform", () => {
  it("converts the viewport center back to source pixels", () => {
    // image 4000x3000 at scale 1, centered in 256 viewport:
    // x = (256-4000)/2 = -1872, y = (256-3000)/2 = -1372
    const rect = cropRectFromTransform(
      { x: (256 - 4000) / 2, y: (256 - 3000) / 2, scale: 1 },
      IMG,
      256,
    );
    expect(rect.sourceX).toBe(1872);
    expect(rect.sourceY).toBe(1372);
    expect(rect.side).toBe(256);
  });

  it("divides by scale so zoomed views crop a smaller source region", () => {
    const rect = cropRectFromTransform(
      { x: (256 - 4000 * 2) / 2, y: (256 - 3000 * 2) / 2, scale: 2 },
      IMG,
      256,
    );
    // center in source = ((256/2 - x)/scale) = (128 + 1872*... ) — center stays
    // 2000,1500 because the image is centered; side shrinks to 128
    expect(rect.sourceX).toBe(2000 - 64);
    expect(rect.sourceY).toBe(1500 - 64);
    expect(rect.side).toBe(128);
  });

  it("clamps the rect inside the image bounds", () => {
    const rect = cropRectFromTransform({ x: 0, y: 0, scale: 4 }, IMG, 256);
    expect(rect.sourceX).toBeGreaterThanOrEqual(0);
    expect(rect.sourceY).toBeGreaterThanOrEqual(0);
    expect(rect.sourceX + rect.side).toBeLessThanOrEqual(4000);
    expect(rect.sourceY + rect.side).toBeLessThanOrEqual(3000);
  });
});
