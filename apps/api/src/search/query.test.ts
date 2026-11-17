import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./query";

describe("search query", () => {
  it("parses every supported filter and quoted names without consuming text", () => {
    const parsed = parseSearchQuery(
      'pump leak is:open status:"In Progress" assignee:"Ayu Saraswati" board:KFL label:bug priority:high type:ticket',
    );
    expect(parsed.text).toBe("pump leak");
    expect(parsed.filters).toEqual({
      is: ["open"],
      status: ["in progress"],
      assignee: ["ayu saraswati"],
      board: ["kfl"],
      label: ["bug"],
      priority: ["high"],
      type: ["ticket"],
    });
  });
  it("preserves unknown, incomplete and invalid syntax as text", () => {
    expect(
      parseSearchQuery("hello foo:bar status: is:maybe type:nope").text,
    ).toBe("hello foo:bar status: is:maybe type:nope");
  });
  it.each(["KFL-123", "123", "#123", "1", "board:x", "is:done"])(
    "lifts minimum for %s",
    (query) => {
      expect(parseSearchQuery(query).enabled).toBe(true);
    },
  );
  it("does not accept overflowing numeric keys or short text", () => {
    expect(parseSearchQuery("#9999999999999999").key).toBeUndefined();
    expect(parseSearchQuery("ab").enabled).toBe(false);
    expect(parseSearchQuery("").enabled).toBe(false);
  });
  it("supports repeated constraints and case insensitive syntax", () => {
    expect(parseSearchQuery("IS:OPEN board:a board:b").filters).toEqual({
      is: ["open"],
      board: ["a", "b"],
    });
  });
});
