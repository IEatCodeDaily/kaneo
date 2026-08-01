import { describe, expect, it } from "vitest";
import {
  commitTitleToken,
  filterTitleTokenOptions,
  findActiveTitleToken,
  moveTitleTokenHighlight,
  TITLE_TOKEN_RESULT_LIMIT,
} from "../title-token-autocomplete";

const at = (title: string) => findActiveTitleToken(title, title.length);

describe("#72 findActiveTitleToken", () => {
  it("opens the label picker on #", () => {
    expect(at("Fix #bu")).toEqual({ kind: "label", start: 4, query: "bu" });
  });

  it("opens the user picker on @ and the priority picker on >", () => {
    expect(at("Ship @ad")).toMatchObject({ kind: "user", query: "ad" });
    expect(at("Ship !hi")).toMatchObject({ kind: "priority", query: "hi" });
  });

  it("opens immediately on a bare sigil with an empty query", () => {
    expect(at("Fix #")).toEqual({ kind: "label", start: 4, query: "" });
  });

  it("treats a sigil at the very start of the title as a token", () => {
    expect(at("#bug")).toEqual({ kind: "label", start: 0, query: "bug" });
  });

  /**
   * NEGATIVE CONTROL — this is the behaviour the ticket calls out explicitly:
   * "pressing space will treat # as part of the title".
   */
  it("closes once the user types a space after the sigil", () => {
    expect(at("Fix #bug now")).toBeNull();
    expect(at("Fix # ")).toBeNull();
  });

  // NEGATIVE CONTROL: a sigil mid-word is ordinary text, not a trigger.
  it("does not trigger when the sigil is inside a word", () => {
    expect(at("Port to C#")).toBeNull();
    expect(at("mail me@example")).toBeNull();
    expect(at("5!3")).toBeNull();
  });

  it("uses the caret, not the end of the string", () => {
    // Caret sits right after "#la" even though more text follows.
    expect(findActiveTitleToken("Fix #la later", 7)).toEqual({
      kind: "label",
      start: 4,
      query: "la",
    });
  });

  it("returns null for an out-of-range caret", () => {
    expect(findActiveTitleToken("Fix #bug", -1)).toBeNull();
    expect(findActiveTitleToken("Fix #bug", 99)).toBeNull();
  });

  // NEGATIVE CONTROL for the sigil change: ">" was the old priority trigger and
  // must now be ordinary text (it is common in quoted titles like "a > b").
  it("does not treat > as a trigger any more", () => {
    expect(at("Ship >hi")).toBeNull();
    expect(at("a > b")).toBeNull();
  });

  it("picks the sigil nearest the caret", () => {
    expect(at("#one@two")).toMatchObject({ kind: "label" });
    expect(at("#one @two")).toMatchObject({ kind: "user", query: "two" });
  });
});

describe("#72 commitTitleToken", () => {
  it("removes the token so the value lives in the task fields, not the name", () => {
    const title = "Fix #bug";
    const token = findActiveTitleToken(title, title.length);
    if (!token) throw new Error("expected a token");
    expect(commitTitleToken(title, token, title.length)).toEqual({
      title: "Fix ",
      caret: 4,
    });
  });

  it("does not leave a double space when the token sat mid-title", () => {
    const title = "Fix #bug now";
    const token = findActiveTitleToken(title, 8);
    if (!token) throw new Error("expected a token");
    const result = commitTitleToken(title, token, 8);
    expect(result.title).toBe("Fix now");
    expect(result.title).not.toContain("  ");
  });

  it("supports substituting text when a replacement is given", () => {
    const title = "Fix #bu";
    const token = findActiveTitleToken(title, title.length);
    if (!token) throw new Error("expected a token");
    expect(commitTitleToken(title, token, title.length, "#bug")).toEqual({
      title: "Fix #bug",
      caret: 8,
    });
  });
});

describe("#72 filterTitleTokenOptions", () => {
  const options = [
    { id: "1", name: "Bug" },
    { id: "2", name: "Backend" },
    { id: "3", name: "frontend" },
  ];

  it("lists everything for an empty query", () => {
    expect(filterTitleTokenOptions(options, "")).toHaveLength(3);
  });

  it("matches case-insensitively anywhere in the name", () => {
    expect(filterTitleTokenOptions(options, "END").map((o) => o.id)).toEqual([
      "2",
      "3",
    ]);
  });

  // NEGATIVE CONTROL: a non-matching query must yield nothing, otherwise the
  // filter is a pass-through and the assertions above prove nothing.
  it("returns nothing when no option matches", () => {
    expect(filterTitleTokenOptions(options, "zzz")).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      name: `Label ${i}`,
    }));
    expect(filterTitleTokenOptions(many, "label")).toHaveLength(
      TITLE_TOKEN_RESULT_LIMIT,
    );
  });
});

describe("#72 moveTitleTokenHighlight", () => {
  it("wraps in both directions", () => {
    expect(moveTitleTokenHighlight(0, -1, 3)).toBe(2);
    expect(moveTitleTokenHighlight(2, 1, 3)).toBe(0);
    expect(moveTitleTokenHighlight(0, 1, 3)).toBe(1);
  });

  it("stays at zero when there is nothing to highlight", () => {
    expect(moveTitleTokenHighlight(0, 1, 0)).toBe(0);
  });
});
