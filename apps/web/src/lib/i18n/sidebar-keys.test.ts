import {
  defaultLocale,
  defaultResources,
  loadLocaleBundle,
  supportedLocales,
} from "@i18n/resources";
import { describe, expect, it } from "vitest";

const sidebarKeys = [
  "inbox",
  "myTasks",
  "boards",
  "repos",
  "moreBoards",
  "moreRepos",
] as const;

describe("sidebar locale contract", () => {
  it("ships every sidebar label in every supported locale", async () => {
    for (const locale of supportedLocales) {
      const bundle =
        locale === defaultLocale
          ? defaultResources
          : await loadLocaleBundle(locale);
      const sidebar = (bundle as { navigation?: { sidebar?: object } })
        .navigation?.sidebar;

      for (const key of sidebarKeys) {
        expect(sidebar, `${locale} navigation.sidebar.${key}`).toHaveProperty(
          key,
        );
      }
    }
  });
});
