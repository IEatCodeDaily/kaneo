export const THEME_PRESETS = [
  "mono",
  "indigo",
  "slate",
  "graphite",
  "teal",
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];
export type Appearance = {
  theme: "light" | "dark" | "system";
  themePreset: ThemePreset;
  accentColor: string | null;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  themePreset: "mono",
  accentColor: null,
};

export function normalizeAccent(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) return null;
  return value.toLowerCase();
}

export function normalizeAppearance(
  value?: Partial<Appearance> | null,
): Appearance {
  return {
    theme:
      value?.theme === "light" || value?.theme === "system"
        ? value.theme
        : "dark",
    themePreset: THEME_PRESETS.includes(value?.themePreset as ThemePreset)
      ? (value?.themePreset as ThemePreset)
      : "mono",
    accentColor: normalizeAccent(value?.accentColor),
  };
}

export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function accentForeground(accent: string) {
  // Black/white endpoints guarantee >= 4.5:1 for every sRGB accent. Use a
  // near endpoint when it also passes, keeping the chrome a little softer.
  const light =
    contrastRatio(accent, "#ffffff") >= contrastRatio(accent, "#000000");
  const near = light ? "#fafafa" : "#111111";
  return contrastRatio(accent, near) >= 4.5
    ? near
    : light
      ? "#ffffff"
      : "#000000";
}

export const ACCENT_TOKENS = [
  "primary",
  "primary-foreground",
  "ring",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-ring",
  "primary-soft",
  "primary-soft-foreground",
  "row-selected",
] as const;

export function applyAppearance(appearance: Appearance, systemDark: boolean) {
  const root = document.documentElement;
  const dark =
    appearance.theme === "system" ? systemDark : appearance.theme === "dark";
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.dataset.theme = appearance.themePreset;
  for (const token of ACCENT_TOKENS) root.style.removeProperty(`--${token}`);
  const accent = normalizeAccent(appearance.accentColor);
  if (!accent) return;
  const foreground = accentForeground(accent);
  const values: Record<(typeof ACCENT_TOKENS)[number], string> = {
    primary: accent,
    "primary-foreground": foreground,
    ring: accent,
    "sidebar-primary": accent,
    "sidebar-primary-foreground": foreground,
    "sidebar-ring": accent,
    "primary-soft": `color-mix(in srgb, ${accent} 16%, var(--background))`,
    "primary-soft-foreground": "var(--foreground)",
    "row-selected": `color-mix(in srgb, ${accent} 16%, var(--background))`,
  };
  for (const token of ACCENT_TOKENS)
    root.style.setProperty(`--${token}`, values[token]);
}
