/**
 * Resource rows must never surface a raw id as text: a pasted Kaneo URL's
 * last path segment is a row/table/ticket id, and a stored title can be
 * missing entirely. These helpers are the one place that decides what a
 * link resource shows as its label.
 */

/** cuid/UUID-shaped text: storage key, never a user-facing label. */
const RAW_ID =
  /\b[a-z0-9]{20,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function hasRawId(text: string) {
  return RAW_ID.test(text);
}

/** A link into this Kaneo (same origin): its URLs carry internal ids. */
export function isInternalUrl(url: string) {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Readable last resort: the host, never a path that could carry ids. */
export function hostLabel(url: string) {
  try {
    return new URL(url).host || "Kaneo link";
  } catch {
    return "Kaneo link";
  }
}

/**
 * Label for a link resource: the stored title when it is human text,
 * "Kaneo link" for links into this app, otherwise the hostname. A path
 * fragment or an id is never shown.
 */
export function resourceLinkLabel(
  url: string,
  title: string | null | undefined,
) {
  const named = (title ?? "").trim();
  if (named && !hasRawId(named)) return named;
  return isInternalUrl(url) ? "Kaneo link" : hostLabel(url);
}
