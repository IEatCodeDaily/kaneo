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

describe("Stellarc palette (#151)", () => {
  it("uses the supplied dark tokens and keeps the viewport darker than the sidebar", () => {
    expect(value(dark, "background")).toBe("#0a0a0b");
    expect(value(dark, "sidebar")).toBe("#131315");
    expect(value(dark, "border")).toBe("#262629");
    expect(value(dark, "foreground")).toBe("#e6e6e6");
    expect(value(dark, "muted-foreground")).toBe("#999a9c");
    const background = value(dark, "background");
    const sidebar = value(dark, "sidebar");
    expect(background).toBeDefined();
    expect(sidebar).toBeDefined();
    if (!background || !sidebar) throw new Error("Dark surface tokens missing");
    expect(luminance(background)).toBeLessThan(luminance(sidebar));
  });

  it("uses the supplied light viewport and elevated surface tokens", () => {
    expect(value(css, "background")).toBe("#f6f6f7");
    expect(value(css, "sidebar")).toBe("#ffffff");
    expect(value(css, "border")).toBe("#e2e2e5");
    expect(value(css, "foreground")).toBe("#171719");
    expect(value(css, "muted-foreground")).toBe("#5d5d60");
  });
});
