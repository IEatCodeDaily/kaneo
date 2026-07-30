import enUS from "./en-US.json";

export const supportedLocales = [
  "mk-MK",
  "nl-NL",
  "de-DE",
  "el-GR",
  "en-US",
  "es-ES",
  "fr-FR",
  "id-ID",
  "ko-KR",
  "ru-RU",
  "tr-TR",
  "uk-UA",
] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en-US";

/**
 * English is bundled eagerly because it is the fallback language — i18next needs
 * it synchronously to render anything, including while another locale loads.
 */
export const defaultResources = enUS;

/**
 * Non-default locales are partial: they omit keys that haven't been translated
 * yet, so they aren't assignable to `typeof enUS`. i18next falls back to the
 * default locale per-key, so a loose shape is the accurate type here.
 */
export type LocaleBundle = Record<string, unknown>;

/**
 * Every other locale is a dynamic import, so a visitor downloads one language
 * instead of twelve.
 *
 * These used to be twelve static imports collected into a `resources` object,
 * which put all ~1 MB of locale JSON in the entry chunk (the app is ~1.9 MB
 * before this change) even though a user reads exactly one of them.
 */
const localeLoaders: Partial<
  Record<AppLocale, () => Promise<{ default: unknown }>>
> = {
  "de-DE": () => import("./de-DE.json"),
  "el-GR": () => import("./el-GR.json"),
  "es-ES": () => import("./es-ES.json"),
  "fr-FR": () => import("./fr-FR.json"),
  "id-ID": () => import("./id-ID.json"),
  "ko-KR": () => import("./ko-KR.json"),
  "mk-MK": () => import("./mk-MK.json"),
  "nl-NL": () => import("./nl-NL.json"),
  "ru-RU": () => import("./ru-RU.json"),
  "tr-TR": () => import("./tr-TR.json"),
  "uk-UA": () => import("./uk-UA.json"),
};

/** Resolves to the locale's bundle, or null for the eagerly-bundled default. */
export async function loadLocaleBundle(
  locale: AppLocale,
): Promise<LocaleBundle | null> {
  if (locale === defaultLocale) return null;
  const load = localeLoaders[locale];
  if (!load) return null;
  const mod = await load();
  return mod.default as LocaleBundle;
}
