import { beforeEach, describe, expect, it } from "vitest";
import { useUserPreferencesStore } from "./user-preferences";

const STORAGE_NAME = "user-preferences";

describe("user preferences persistence", () => {
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
});
