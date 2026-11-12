import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Design v3 token contract (docs/plans/2026-11-12-design-v3-implementation.md, slice S1).
// Pins what the design system promises so a later edit cannot silently drop a token
// or move a status tone onto a neighbour.
const css = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
}

function hex(theme: string, token: string): string {
  const m = block(theme).match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
  expect(m, `${theme} ${token}`).not.toBeNull();
  return (m as RegExpMatchArray)[1];
}

// sRGB hex -> OKLab (Björn Ottosson's reference matrices).
function oklab(h: string): [number, number, number] {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map((i) =>
    lin(Number.parseInt(h.slice(i, i + 2), 16) / 255),
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const distance = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const TONES = ["gray", "blue", "pink", "amber", "green", "red"];

describe("design v3 tokens", () => {
  it.each([":root", ".dark"])("%s defines every new token", (theme) => {
    for (const token of [
      "--faint-foreground",
      "--primary-soft",
      "--primary-soft-foreground",
      "--row-hover",
      "--row-selected",
      ...TONES.map((t) => `--tone-${t}`),
    ]) {
      expect(block(theme)).toContain(`${token}:`);
    }
  });

  it.each([":root", ".dark"])(
    "%s keeps every status tone pair at least 0.10 ΔE_ok apart",
    (theme) => {
      const tones = TONES.map((t) => [t, hex(theme, `--tone-${t}`)] as const);
      for (let i = 0; i < tones.length; i++) {
        for (let j = i + 1; j < tones.length; j++) {
          expect(
            distance(tones[i][1], tones[j][1]),
            `${tones[i][0]}/${tones[j][0]}`,
          ).toBeGreaterThanOrEqual(0.1);
        }
      }
    },
  );

  it("maps the new tokens to utilities and pins the three radii", () => {
    const theme = block("@theme inline");
    for (const u of [
      "--color-faint-foreground",
      "--color-primary-soft",
      "--color-row-hover",
      "--color-tone-red",
      "--text-ui:",
    ]) {
      expect(theme).toContain(u);
    }
    expect(theme).toContain("--radius-sm: 4px;");
    expect(theme).toContain("--radius-md: 6px;");
    expect(theme).toContain("--radius-lg: 10px;");
  });

  // #5e6ad2 as text is 3.81:1 on the dark card, under the 4.5:1 floor; accent-coloured
  // text must use text-primary-soft-foreground (6.7:1 light, 9.0:1 dark).
  it("uses no bare text-primary in app source", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name)
        ) {
          if (
            /(?<![\w:-])(?:[\w-]+:)*text-primary(?![\w/-])/.test(
              readFileSync(full, "utf8"),
            )
          )
            offenders.push(path.relative(srcRoot, full));
        }
      }
    };
    const srcRoot = path.resolve(__dirname, "..");
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
