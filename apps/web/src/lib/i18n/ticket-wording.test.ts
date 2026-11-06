import { defaultResources } from "@i18n/resources";
import { describe, expect, it } from "vitest";

// KFL-386: the product noun is "ticket". English UI copy must not drift back
// to "task". The markdown checklist block keeps its search synonyms.
const ALLOWED = new Set(["activity.comment.editor.searchTaskList"]);

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value))
      yield* strings(child, path ? `${path}.${key}` : key);
}

describe("ticket wording (en-US)", () => {
  it("uses Ticket(s), never Task(s), in user-visible copy", () => {
    const offenders = [...strings(defaultResources, "")]
      .filter(([path, text]) => !ALLOWED.has(path) && /\btasks?\b/i.test(text))
      .map(([path, text]) => `${path} = ${text}`);
    expect(offenders).toEqual([]);
  });
});
