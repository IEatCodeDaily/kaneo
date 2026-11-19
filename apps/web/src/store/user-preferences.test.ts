import { beforeEach, describe, expect, it } from "vitest";
import { useUserPreferencesStore } from "./user-preferences";

const STORAGE_NAME = "user-preferences";

describe("user preferences persistence", () => {
  it("keeps appearance isolated by account and restores it after hydration", async () => {
    useUserPreferencesStore.setState({
      appearanceUserId: null,
      userAppearance: {},
      theme: "dark",
      themePreset: "mono",
      accentColor: null,
    });
    const store = () => useUserPreferencesStore.getState();
    store().setAppearanceUserId("alice");
    store().setAppearance({
      theme: "light",
      themePreset: "teal",
      accentColor: "#abcdef",
    });
    store().setAppearanceUserId("bob");
    expect(store().themePreset).toBe("mono");
    expect(store().accentColor).toBeNull();
    store().setAppearance({ themePreset: "graphite" });
    store().setAppearanceUserId(null);
    expect(store().themePreset).toBe("mono");
    await useUserPreferencesStore.persist.rehydrate();
    store().setAppearanceUserId("alice");
    expect(store()).toMatchObject({
      theme: "light",
      themePreset: "teal",
      accentColor: "#abcdef",
    });
    store().setAppearanceUserId("bob");
    expect(store().themePreset).toBe("graphite");
    store().setAppearance({ accentColor: "invalid" });
    expect(store().accentColor).toBeNull();
  });
  it("persists theme overrides and clears them when the preset changes", () => {
    const store = () => useUserPreferencesStore.getState();
    useUserPreferencesStore.setState({
      themePreset: "mono",
      accentColor: null,
      themeOverrides: {},
    });
    store().setThemeOverride("background", "dark", "#123456");
    expect(store().themeOverrides.background).toEqual({ dark: "#123456" });
    store().setAppearance({ theme: "light" });
    expect(store().themeOverrides.background).toBeDefined();
    store().setAppearance({ themePreset: "teal" });
    expect(store().themeOverrides).toEqual({});
    store().setThemeOverride("primary", "light", "#abcdef");
    store().resetThemeOverrides();
    expect(store().themeOverrides).toEqual({});
    const persisted = JSON.parse(
      localStorage.getItem(STORAGE_NAME) ?? "{}",
    ) as { state?: { themeOverrides?: unknown } };
    expect(persisted.state?.themeOverrides).toEqual({});
  });
  beforeEach(() => {
    localStorage.clear();
    useUserPreferencesStore.setState({ recentPages: [] });
  });

  it("adds openedAt when hydrating legacy recent pages without clearing paths", async () => {
    const hydratedAt = Date.now();
    localStorage.setItem(
      STORAGE_NAME,
      JSON.stringify({
        state: {
          recentPages: [
            {
              pathname: "/dashboard/organization/acme/board/delivery",
              label: "Delivery",
            },
          ],
        },
        version: 0,
      }),
    );

    await useUserPreferencesStore.persist.rehydrate();
    const [recentPage] = useUserPreferencesStore.getState().recentPages;
    expect(recentPage).toMatchObject({
      pathname: "/dashboard/organization/acme/board/delivery",
      label: "Delivery",
    });
    expect(recentPage.openedAt).toBeGreaterThanOrEqual(hydratedAt);
    expect(recentPage.openedAt).toBeLessThanOrEqual(Date.now());
  });

  it("persists ticket display independently per user and organization", async () => {
    useUserPreferencesStore
      .getState()
      .setTicketDisplay("user:org", { sort: "priority", group: "board" });
    await useUserPreferencesStore.persist.rehydrate();
    expect(
      useUserPreferencesStore.getState().ticketDisplay["user:org"],
    ).toEqual({ sort: "priority", group: "board" });
    expect(
      useUserPreferencesStore.getState().ticketDisplay["other:org"],
    ).toBeUndefined();
  });

  it("persists whether Recent is open", async () => {
    useUserPreferencesStore.getState().setRecentOpen(true);

    expect(useUserPreferencesStore.getState().recentOpen).toBe(true);
    expect(localStorage.getItem(STORAGE_NAME)).toContain('"recentOpen":true');
  });
});
