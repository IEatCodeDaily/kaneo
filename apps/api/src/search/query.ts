export const SEARCH_FILTERS = [
  "is",
  "status",
  "assignee",
  "board",
  "label",
  "priority",
  "type",
] as const;
export type SearchFilter = (typeof SEARCH_FILTERS)[number];
const kinds = ["ticket", "board", "repo", "issue", "pr", "comment"];

/** Quoted values support column/member names with spaces. Unknown syntax stays text. */
export function parseSearchQuery(query: string) {
  const filters: Partial<Record<SearchFilter, string[]>> = {};
  const text: string[] = [];
  for (const token of query.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []) {
    const match = token.match(/^([a-z]+):(.+)$/i);
    const name = match?.[1]?.toLowerCase() as SearchFilter;
    const value = match?.[2]?.replace(/^(["'])(.*)\1$/, "$2");
    if (
      value &&
      SEARCH_FILTERS.includes(name) &&
      (name !== "is" ||
        ["open", "closed", "done"].includes(value.toLowerCase())) &&
      (name !== "type" || kinds.includes(value.toLowerCase()))
    ) {
      filters[name] ??= [];
      filters[name].push(value.toLowerCase());
    } else text.push(token);
  }
  const term = text.join(" ");
  const key = term.match(/^(?:([a-z][\w-]*)-)?#?(\d+)$/i);
  const number = key?.[2] ? Number(key[2]) : undefined;
  const validKey =
    number !== undefined &&
    Number.isSafeInteger(number) &&
    number <= 2147483647;
  return {
    text: term,
    terms: Array.from(term.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []),
    filters,
    key: validKey ? { slug: key?.[1]?.toLowerCase(), number } : undefined,
    enabled: term.length >= 3 || validKey || Object.keys(filters).length > 0,
  };
}
