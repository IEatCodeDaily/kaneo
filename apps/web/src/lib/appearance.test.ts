import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACCENT_TOKENS,
  accentForeground,
  applyAppearance,
  contrastRatio,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  THEME_PRESETS,
} from "./appearance";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const bootstrap = html.match(
  /<script data-appearance-bootstrap>([\s\S]*?)<\/script>/,
)?.[1];

function palette(preset: string, dark: boolean) {
  const blocks = [
    ...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ];
  const selector =
    preset === "mono"
      ? dark
        ? '.dark[data-theme="mono"]'
        : '[data-theme="mono"]'
      : `${dark ? ".dark" : ""}[data-theme="${preset}"]`;
  const block = blocks.find(([_, selectors]) =>
    selectors.split(",").some((part) => part.trim() === selector),
  )?.[2];
  expect(block, selector).toBeDefined();
  return Object.fromEntries(
    [...String(block).matchAll(/--([\w-]+):\s*([^;]+);/g)].map(
      ([_, name, value]) => [name, value.trim()],
    ),
  );
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("appearance palettes", () => {
  it("tests every named CSS palette, including newly added presets", () => {
    const ids = [
      ...new Set([...css.matchAll(/data-theme="([\w-]+)"/g)].map((m) => m[1])),
    ];
    expect(ids.sort()).toEqual([...THEME_PRESETS].sort());
    for (const id of ids)
      for (const dark of [false, true]) {
        const t = palette(id, dark);
        const required = Object.keys(palette("mono", dark)).filter(
          (key) => !key.startsWith("font-") && key !== "radius",
        );
        expect(Object.keys(t), `${id} ${dark}: full token set`).toEqual(
          expect.arrayContaining(required),
        );
        expect(
          contrastRatio(t.primary, t["primary-foreground"]),
          `${id} ${dark}: button`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(t.background, t["muted-foreground"]),
          `${id} ${dark}: muted`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("chooses readable text across the sRGB cube, including mid-tone endpoints", () => {
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const accent = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          expect(
            contrastRatio(accent, accentForeground(accent)),
            accent,
          ).toBeGreaterThanOrEqual(4.5);
        }
  });

  it("validates persisted values and rejects CSS injection", () => {
    expect(
      normalizeAppearance({
        themePreset: "bad",
        accentColor: "red; color: red",
      } as never),
    ).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ accentColor: "#ABCDEF" }).accentColor).toBe(
      "#abcdef",
    );
  });

  it("applies mode, palette, override, system changes and reset live", () => {
    applyAppearance(
      { theme: "system", themePreset: "teal", accentColor: "#eeeeee" },
      true,
    );
    expect(document.documentElement.dataset.theme).toBe("teal");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue("--primary-foreground"),
    ).toBe("#111111");
    for (const token of ACCENT_TOKENS)
      expect(
        document.documentElement.style.getPropertyValue(`--${token}`),
      ).not.toBe("");
    applyAppearance(
      { theme: "system", themePreset: "slate", accentColor: null },
      false,
    );
    expect(document.documentElement.classList.contains("light")).toBe(true);
    for (const token of ACCENT_TOKENS)
      expect(
        document.documentElement.style.getPropertyValue(`--${token}`),
      ).toBe("");
  });

  it("restores the same accent tokens before React, and handles corrupt storage", () => {
    expect(bootstrap).toBeTruthy();
    for (const accent of ["#777777", "#eeeeee", "#000000", "#123456"]) {
      const prefs = {
        theme: "light",
        themePreset: "graphite",
        accentColor: accent,
      } as const;
      applyAppearance(prefs, false);
      const expected = document.documentElement.style.cssText;
      document.documentElement.removeAttribute("style");
      document.documentElement.removeAttribute("class");
      localStorage.setItem(
        "user-preferences",
        JSON.stringify({ state: prefs }),
      );
      new Function(bootstrap ?? "")();
      expect(document.documentElement.style.cssText).toBe(expected);
      expect(document.documentElement.dataset.theme).toBe("graphite");
      expect(document.documentElement.classList.contains("light")).toBe(true);
    }
    localStorage.setItem("user-preferences", "{");
    document.documentElement.removeAttribute("class");
    new Function(bootstrap ?? "")();
    expect(document.documentElement.dataset.theme).toBe("mono");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
