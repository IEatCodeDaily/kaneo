/**
 * Query handling for the `#` reference autocomplete.
 *
 * Typing `#` on its own must already show a list of referenceable tasks: users
 * expect the picker to open on the trigger character, not after they have
 * guessed a search term. The search endpoint rejects an empty `q`
 * (`minLength(1)`), so an empty query is mapped onto a match-everything
 * pattern instead of being dropped on the floor.
 */

/** LIKE wildcard: the API interpolates `q` into `%<q>%`, so this matches all rows. */
export const REFERENCE_MATCH_ALL_QUERY = "%";

/**
 * True when the reference menu should ask the server for results.
 *
 * Deliberately also true for an empty query — that is the eager-open case.
 */
export function shouldShowReferenceMenu(query: string): boolean {
  return typeof query === "string";
}

/** Maps the raw suggestion query onto the query string sent to the search API. */
export function toReferenceSearchQuery(query: string): string {
  const trimmed = (query ?? "").trim();
  return trimmed.length === 0 ? REFERENCE_MATCH_ALL_QUERY : trimmed;
}
