import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeAccent,
  THEME_PRESETS,
  THEME_TOKEN_GROUPS,
  THEME_TOKENS,
  type ThemeOverrideMode,
} from "@/lib/appearance";
import { useUserPreferencesStore } from "@/store/user-preferences";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/appearance",
)({ component: AppearanceSettings });

const SWATCHES = [
  "#5e6ad2",
  "#2563eb",
  "#0891b2",
  "#0f766e",
  "#d97706",
  "#db2777",
];

const pascal = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

export function AppearanceSettings() {
  const { t } = useTranslation();
  const {
    theme,
    themePreset,
    accentColor,
    themeOverrides,
    setTheme,
    setAppearance,
    setThemeOverride,
    resetThemeOverrides,
  } = useUserPreferencesStore();
  const [draft, setDraft] = useState<string | null>(null);
  const hex = draft ?? accentColor ?? "";
  const invalid = hex !== "" && !normalizeAccent(hex);
  // The editor edits either mode; default to the effective one.
  const [tab, setTab] = useState<"light" | "dark" | null>(null);
  const dark =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : theme === "dark";
  const editDark = tab === null ? dark : tab === "dark";
  const mode: ThemeOverrideMode = editDark ? "dark" : "light";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [presetColors, setPresetColors] = useState<Record<string, string>>({});
  const probeRef = useRef<HTMLSpanElement>(null);

  // Preset values for the swatch pickers, read from a probe scoped to the
  // edited mode (the strip re-declares tokens, so it never sees overrides).
  useLayoutEffect(() => {
    const el = probeRef.current;
    if (!el) return;
    el.dataset.theme = themePreset;
    el.classList.toggle("dark", editDark);
    const styles = getComputedStyle(el);
    const next: Record<string, string> = {};
    for (const token of THEME_TOKENS)
      next[token] = styles.getPropertyValue(`--${token}`).trim();
    setPresetColors((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [editDark, themePreset]);

  const resolved = (token: string) =>
    themeOverrides[token]?.[mode] || presetColors[token] || "";
  const commit = (token: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${mode}:${token}`]: value }));
    const valid = normalizeAccent(value);
    if (valid || value === "") setThemeOverride(token, mode, valid);
  };
  const resetToken = (token: string) => {
    setThemeOverride(token, "light", null);
    setThemeOverride(token, "dark", null);
    setDrafts((prev) => ({ ...prev, [`${mode}:${token}`]: "" }));
  };
  const resetAll = () => {
    resetThemeOverrides();
    setDrafts({});
  };

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-4xl space-y-6"
      data-testid="appearance-settings"
    >
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {t("settings:appearance.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("settings:appearance.description")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings:appearance.mode")}</CardTitle>
        </CardHeader>
        <CardPanel>
          <fieldset
            className="min-w-0 flex flex-wrap gap-2"
            aria-label={t("settings:appearance.mode")}
          >
            {(["light", "dark", "system"] as const).map((mode) => (
              <Button
                key={mode}
                className="min-h-11 sm:min-h-0"
                variant={theme === mode ? "default" : "outline"}
                aria-pressed={theme === mode}
                onClick={() => setTheme(mode)}
              >
                {t(
                  `settings:preferencesPage.theme${mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"}`,
                )}
              </Button>
            ))}
          </fieldset>
        </CardPanel>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings:appearance.preset")}</CardTitle>
        </CardHeader>
        <CardPanel>
          <fieldset
            className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3"
            aria-label={t("settings:appearance.preset")}
          >
            {THEME_PRESETS.map((preset) => (
              <Button
                key={preset}
                variant="outline"
                className="h-auto min-w-0 flex-col whitespace-normal aria-pressed:ring-2 aria-pressed:ring-ring sm:h-auto"
                aria-pressed={themePreset === preset}
                data-testid={`preset-${preset}`}
                onClick={() => {
                  setAppearance({ themePreset: preset, accentColor: null });
                  setDraft(null);
                }}
              >
                <span
                  data-theme={preset}
                  className="dark flex w-full gap-2 rounded-sm bg-background p-2 text-foreground"
                  aria-hidden="true"
                >
                  <span className="w-4 shrink-0 rounded-sm bg-sidebar" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="h-2 w-full rounded-sm bg-muted" />
                    <span className="h-2 w-3/4 rounded-sm bg-card" />
                    <span className="rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground">
                      Aa
                    </span>
                  </span>
                </span>
                <span>
                  {t(`settings:appearance.${preset}`)}
                  {themePreset === preset ? " ✓" : ""}
                </span>
              </Button>
            ))}
          </fieldset>
        </CardPanel>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings:appearance.customize")}</CardTitle>
        </CardHeader>
        <CardPanel className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("settings:appearance.customizeHint")}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <fieldset
              className="min-w-0 flex flex-wrap gap-2"
              aria-label={t("settings:appearance.editMode")}
            >
              {(["light", "dark"] as const).map((tabMode) => (
                <Button
                  key={tabMode}
                  className="min-h-11 sm:min-h-0"
                  variant={mode === tabMode ? "default" : "outline"}
                  aria-pressed={mode === tabMode}
                  data-testid={`customize-tab-${tabMode}`}
                  onClick={() => setTab(tabMode)}
                >
                  {t(
                    `settings:preferencesPage.theme${tabMode === "light" ? "Light" : "Dark"}`,
                  )}
                </Button>
              ))}
            </fieldset>
            <Button
              variant="outline"
              className="ml-auto"
              disabled={Object.keys(themeOverrides).length === 0}
              data-testid="customize-reset-all"
              onClick={resetAll}
            >
              {t("settings:appearance.resetAll")}
            </Button>
          </div>
          <div
            data-testid="theme-preview-strip"
            aria-hidden="true"
            className="flex gap-2 rounded-sm border p-2"
            style={
              Object.fromEntries(
                THEME_TOKENS.map((token) => [`--${token}`, resolved(token)]),
              ) as React.CSSProperties
            }
          >
            <span className="w-4 shrink-0 rounded-sm bg-sidebar" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="h-2 w-full rounded-sm bg-muted" />
              <span className="h-2 w-3/4 rounded-sm bg-card" />
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground">
                  Aa
                </span>
                <span className="size-2 rounded-full bg-destructive" />
                <span className="size-2 rounded-full bg-success" />
                <span className="size-2 rounded-full bg-warning" />
                <span className="size-2 rounded-full bg-info" />
              </span>
            </span>
          </div>
          {THEME_TOKEN_GROUPS.map((group) => (
            <section key={group.id} className="space-y-2">
              <h3 className="text-sm font-medium">
                {t(`settings:appearance.group${pascal(group.id)}`)}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {group.tokens.map((token) => {
                  const label = t(`settings:appearance.token${pascal(token)}`);
                  const value = drafts[`${mode}:${token}`] ?? "";
                  const overridden = Boolean(
                    themeOverrides[token]?.light || themeOverrides[token]?.dark,
                  );
                  return (
                    <div
                      key={token}
                      className="flex min-w-0 flex-wrap items-center gap-2"
                      data-testid={`token-${token}`}
                    >
                      <Label
                        htmlFor={`token-${token}`}
                        className="min-w-0 flex-1 truncate"
                      >
                        {label}
                      </Label>
                      <ColorInput
                        aria-label={`${label} ${t("settings:appearance.picker")}`}
                        value={resolved(token) || "#000000"}
                        onChange={(event) => commit(token, event.target.value)}
                      />
                      <Input
                        id={`token-${token}`}
                        className="w-28 max-w-28 shrink"
                        placeholder="#rrggbb"
                        value={
                          drafts[`${mode}:${token}`] ??
                          themeOverrides[token]?.[mode] ??
                          ""
                        }
                        maxLength={7}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={value !== "" && !normalizeAccent(value)}
                        onChange={(event) => commit(token, event.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        aria-label={`${t("settings:appearance.resetToken")} ${label}`}
                        disabled={!overridden}
                        onClick={() => resetToken(token)}
                      >
                        <RotateCcw aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <span ref={probeRef} className="hidden" aria-hidden="true" />
        </CardPanel>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings:appearance.accent")}</CardTitle>
        </CardHeader>
        <CardPanel className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t("settings:appearance.accentHint")}
          </p>
          <fieldset
            className="min-w-0 flex flex-wrap gap-2"
            aria-label={t("settings:appearance.accent")}
          >
            {SWATCHES.map((color) => (
              <Button
                key={color}
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11 aria-pressed:ring-2 aria-pressed:ring-ring sm:min-h-0 sm:min-w-0"
                aria-label={color}
                aria-pressed={accentColor === color}
                onClick={() => {
                  setAppearance({ accentColor: color });
                  setDraft(null);
                }}
              >
                <span
                  className="size-4 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
              </Button>
            ))}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="accent-hex">{t("settings:appearance.hex")}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="accent-hex"
                className="min-w-0 sm:max-w-64"
                placeholder="#rrggbb"
                value={hex}
                maxLength={7}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalid}
                aria-describedby={invalid ? "accent-error" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  const accent = normalizeAccent(value);
                  if (accent || value === "")
                    setAppearance({ accentColor: accent });
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  setAppearance({ accentColor: null });
                  setDraft(null);
                }}
              >
                {t("settings:appearance.reset")}
              </Button>
            </div>
            {invalid && (
              <p
                id="accent-error"
                role="alert"
                className="text-xs text-destructive-foreground"
              >
                {t("settings:appearance.invalidHex")}
              </p>
            )}
          </div>
          <Button data-testid="appearance-preview-action">
            {t("settings:appearance.preview")}
          </Button>
        </CardPanel>
      </Card>
    </div>
  );
}
