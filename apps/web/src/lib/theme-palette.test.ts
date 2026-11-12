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
describe("Design v3 palette (supersedes #151)", () => {
  it("uses the v3 dark tokens and keeps the sidebar darker than the viewport", () => {
    expect(value(dark, "background")).toBe("#111113");
    expect(value(dark, "sidebar")).toBe("#0b0b0d");
    expect(value(dark, "border")).toBe("#242428");
    expect(value(dark, "foreground")).toBe("#e8e8eb");
    expect(value(dark, "muted-foreground")).toBe("#9c9ca3");
    const background = value(dark, "background");
    const sidebar = value(dark, "sidebar");
    expect(background).toBeDefined();
    expect(sidebar).toBeDefined();
    if (!background || !sidebar) throw new Error("Dark surface tokens missing");
    expect(luminance(sidebar)).toBeLessThan(luminance(background));
  });

  it("uses the v3 light tokens and keeps the sidebar darker than the viewport", () => {
    expect(value(css, "background")).toBe("#fafafb");
    expect(value(css, "sidebar")).toBe("#efeff1");
    expect(value(css, "border")).toBe("#e6e6e9");
    expect(value(css, "foreground")).toBe("#18181b");
    expect(value(css, "muted-foreground")).toBe("#5f5f67");
    expect(luminance("#efeff1")).toBeLessThan(luminance("#fafafb"));
  });
});
