/**
 * True inside a Microsoft Teams host: desktop/web Teams frame the tab, while
 * Teams mobile loads it top-level in a WebView that exposes `nativeInterface`.
 */
export function inTeamsHost(w: Window = window): boolean {
  return w.self !== w.top || "nativeInterface" in w;
}

/**
 * Opt the tab into Teams app suspension: Teams keeps the iframe alive (hidden)
 * when the user switches away, so coming back restores the page and its state
 * instead of reloading and re-running sign-in. Both handlers are required.
 * Runs on every page load inside Teams because the tab hands off to the app
 * with a full navigation.
 */
export async function keepAliveInTeams(): Promise<void> {
  const { app } = await import("@microsoft/teams-js");
  await app.initialize();
  app.lifecycle.registerBeforeSuspendOrTerminateHandler(async () => {});
  app.lifecycle.registerOnResumeHandler(() => app.notifySuccess());
  app.notifySuccess();
}

/**
 * Where the Teams tab should land. A card's deep link passes the Kaneo path as
 * the tab's subPageId; only same-app dashboard paths are honoured (no open
 * redirect), anything else lands on the dashboard.
 */
export function tabTarget(subPageId?: string): string {
  return subPageId && /^\/dashboard(\/[A-Za-z0-9_-]+)*\/?$/.test(subPageId)
    ? subPageId
    : "/dashboard";
}
