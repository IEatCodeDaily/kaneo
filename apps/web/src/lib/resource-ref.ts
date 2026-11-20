/**
 * Route params for repos, tables and dashboards carry a SLUG (with legacy
 * createId() ids still resolving — #resource-slugs). One matcher for every
 * resource list so resolution never forks per surface.
 */

/**
 * Whether `ref` has the shape of a cuid2 (`createId()`): 20–25 lowercase
 * alphanumeric characters. Slug-shaped params never collide with real-world
 * ids because slugs normalize through [a-z0-9-], and a hyphen is the common
 * case — but pure-alphanumeric slugs shorter than 20 chars also fail the
 * length window.
 */
export function looksLikeCuid(ref: string | undefined): boolean {
  return typeof ref === "string" && /^[a-z0-9]{20,25}$/.test(ref);
}

export type RefMatcher<T> = {
  getId: (item: T) => string;
  getSlug: (item: T) => string | null | undefined;
};

/**
 * Match a route param against an organization-scoped resource list: a
 * cuid-shaped ref resolves by id first (legacy URLs keep working even while
 * the list is stale), anything else by slug first. Falls back to the other
 * key, and fails closed (null) when nothing matches — a foreign org's id or
 * slug is simply not in this org's list.
 */
export function matchResourceRef<T>(
  items: readonly T[] | undefined,
  ref: string | undefined,
  getId: (item: T) => string,
  getSlug: (item: T) => string | null | undefined,
): T | null {
  if (!items || !ref) return null;
  const byId = () => items.find((item) => getId(item) === ref) ?? null;
  const bySlug = () =>
    items.find((item) => getSlug(item)?.toLowerCase() === ref.toLowerCase()) ??
    null;
  return looksLikeCuid(ref) ? (byId() ?? bySlug()) : (bySlug() ?? byId());
}
