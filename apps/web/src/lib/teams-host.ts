/**
 * True inside a Microsoft Teams host: desktop/web Teams frame the tab, while
 * Teams mobile loads it top-level in a WebView that exposes `nativeInterface`.
 */
export function inTeamsHost(w: Window = window): boolean {
  return w.self !== w.top || "nativeInterface" in w;
}
