import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const dark = css.match(/\.dark\s*\{([\s\S]*?)color-scheme: dark/)?.[1] ?? "";

function value(source: string, token: string) {
  return source.match(new RegExp(`--${token}:\\s*(#[0-9a-f]+)`))?.[1];
}

function luminance(hex: string) {
  const [r, g, b] =
    hex.match(/\w\w/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Design v3 (docs/plans/2026-11-12-design-v3-implementation.md) supersedes the #151 values and
// inverts its sidebar rule: the sidebar is now the darkest surface in both themes.
describe("Cold monochrome palette", () => {
  it("uses cold dark tokens and keeps the sidebar darker than the viewport", () => {
    expect(value(dark, "background")).toBe("#0b0d10");
    expect(value(dark, "sidebar")).toBe("#07090c");
    expect(value(dark, "border")).toBe("#232830");
    expect(value(dark, "foreground")).toBe("#e7eaf0");
    expect(value(dark, "muted-foreground")).toBe("#a0a8b5");
    const background = value(dark, "background");
    const sidebar = value(dark, "sidebar");
    expect(background).toBeDefined();
    expect(sidebar).toBeDefined();
    if (!background || !sidebar) throw new Error("Dark surface tokens missing");
    expect(luminance(sidebar)).toBeLessThan(luminance(background));
  });

  it("uses cool off-white tokens and keeps the sidebar darker than the viewport", () => {
    expect(value(css, "background")).toBe("#f8f9fb");
    expect(value(css, "sidebar")).toBe("#eef0f4");
    expect(value(css, "border")).toBe("#e0e3e8");
    expect(value(css, "foreground")).toBe("#181b20");
    expect(value(css, "muted-foreground")).toBe("#555e6b");
    expect(luminance("#eef0f4")).toBeLessThan(luminance("#f8f9fb"));
  });
});
