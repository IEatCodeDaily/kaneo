/**
 * True inside a Microsoft Teams host: desktop/web Teams frame the tab, while
 * Teams mobile loads it top-level in a WebView that exposes `nativeInterface`.
 */
export function inTeamsHost(w: Window = window): boolean {
  return w.self !== w.top || "nativeInterface" in w;
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
