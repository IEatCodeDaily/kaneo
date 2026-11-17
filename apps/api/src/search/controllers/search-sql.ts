import { and, ilike, or, type SQL, sql } from "drizzle-orm";
import { parseSearchQuery } from "../query";

export { parseSearchQuery };
export function searchDocument(title: SQL, body: SQL) {
  return sql<string>`coalesce(${title}, '') || ' ' || coalesce(${body}, '')`;
}

/** Every word must match, possibly in a different field or ticket comment. */
export function textMatch(document: SQL, text: string) {
  return or(
    sql`to_tsvector('simple', ${document}) @@ websearch_to_tsquery('simple', ${text})`,
    ilike(document, `%${text.replace(/[\\%_]/g, "\\$&")}%`),
    sql`kaneo_search_typo(${document}, ${text})`,
  );
}
export function rankedSearch(
  title: SQL,
  body: SQL,
  query: ReturnType<typeof parseSearchQuery>,
  exact?: SQL,
  commentMatch?: (term: string) => SQL,
) {
  const document = searchDocument(title, body);
  const words = query.terms;
  const match = query.text
    ? or(
        exact,
        words.length
          ? and(
              ...words.map((term) =>
                or(textMatch(document, term), commentMatch?.(term)),
              ),
            )
          : sql`false`,
      )
    : sql`true`;
  const titleWords = words.length
    ? and(...words.map((word) => textMatch(title, word)))
    : sql`false`;
  const prefix = `${query.text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  const score = sql<number>`case
    when ${exact ?? sql`false`} then 100
    when ${query.text ? ilike(title, prefix) : sql`false`} then 80
    when ${titleWords} then 70
    when ${words.length ? and(...words.map((word) => textMatch(document, word))) : sql`false`} then 40
    else 20 end`;
  return { match, score };
}
