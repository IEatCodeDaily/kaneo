import {
  defaultLocale,
  loadLocaleBundle,
  supportedLocales,
} from "@i18n/resources";
import { describe, expect, it } from "vitest";

describe("locale resources runtime contract", () => {
  it("loads every supported non-default locale without a runtime reference error", async () => {
    for (const locale of supportedLocales) {
      const bundle = await loadLocaleBundle(locale);
      if (locale === defaultLocale) {
        expect(bundle).toBeNull();
      } else {
        expect(bundle).toBeTruthy();
      }
    }
  });
});
