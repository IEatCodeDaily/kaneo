import { describe, expect, it } from "vitest";
import {
  matchSlashTrigger,
  shouldSlashMenuCaptureEnter,
} from "./slash-trigger";

/**
 * #267: a checklist item ending in a bare slash ate Enter.
 *
 * The old detector was `/(?:^|\s)\/([^\s/]*)$/`, whose `*` matched an empty
 * query — so a trailing `/` counted as an open slash menu, and the capture-phase
 * Enter handler ran a slash command instead of splitting the task item.
 *
 * That was first fixed by refusing to open the menu on a lone `/`, which
 * pre-filtered the list: you had to already know a command's name to see it.
 * Now a bare `/` opens the menu (empty query = show everything) and the Enter
 * capture is gated on `hasQuery` instead, so both behaviours hold at once.
 */
describe("matchSlashTrigger", () => {
  it("opens the menu on a bare trailing slash so the full list is browsable", () => {
    expect(matchSlashTrigger("ship it /")).toEqual({
      query: "",
      matchText: " /",
    });
  });

  it("opens the menu on a slash alone at the start of a line", () => {
    expect(matchSlashTrigger("/")).toEqual({ query: "", matchText: "/" });
  });

  it("triggers as soon as a command character is typed", () => {
    expect(matchSlashTrigger("/t")).toEqual({ query: "t", matchText: "/t" });
  });

  it("triggers mid-line after a space", () => {
    expect(matchSlashTrigger("ship it /to")).toEqual({
      query: "to",
      matchText: " /to",
    });
  });

  it("matches a full command name", () => {
    expect(matchSlashTrigger("/todo")?.query).toBe("todo");
  });

  it("matches hyphenated commands", () => {
    expect(matchSlashTrigger("/code-block")?.query).toBe("code-block");
  });

  it("matches commands containing digits", () => {
    expect(matchSlashTrigger("/h1")?.query).toBe("h1");
  });

  it("ignores a slash inside a word, so and/or is safe", () => {
    expect(matchSlashTrigger("and/or")).toBeNull();
  });

  it("ignores a URL path", () => {
    expect(matchSlashTrigger("see https://example.com/docs")).toBeNull();
  });

  it("ignores a date-like trailing slash", () => {
    expect(matchSlashTrigger("due 12/")).toBeNull();
  });

  it("stops matching once whitespace follows the command", () => {
    expect(matchSlashTrigger("/todo ")).toBeNull();
  });

  it("does not trigger on a double slash", () => {
    expect(matchSlashTrigger("//")).toBeNull();
  });

  it("returns null for text with no slash at all", () => {
    expect(matchSlashTrigger("first item")).toBeNull();
  });
});

describe("shouldSlashMenuCaptureEnter", () => {
  it("captures Enter when the menu has commands and a query was typed", () => {
    expect(
      shouldSlashMenuCaptureEnter({
        hasMenu: true,
        commandCount: 3,
        hasQuery: true,
      }),
    ).toBe(true);
  });

  it("releases Enter when the menu is open but has no commands", () => {
    // Otherwise a menu matching nothing still eats Enter and the user cannot
    // create the next checklist item.
    expect(
      shouldSlashMenuCaptureEnter({ hasMenu: true, commandCount: 0 }),
    ).toBe(false);
  });

  it("releases Enter when there is no menu", () => {
    expect(
      shouldSlashMenuCaptureEnter({ hasMenu: false, commandCount: 5 }),
    ).toBe(false);
  });

  it("releases Enter for a bare-slash menu even though every command matches", () => {
    // THE #267 REGRESSION GUARD. A bare `/` now opens the menu with an empty
    // query, so `commandCount` is the FULL command list — the old
    // `commandCount > 0` check alone would capture Enter here and re-break
    // splitting a checklist item that ends in a slash.
    expect(
      shouldSlashMenuCaptureEnter({
        hasMenu: true,
        commandCount: 12,
        hasQuery: false,
      }),
    ).toBe(false);
  });

  it("captures Enter after the user explicitly selects a command from a bare-slash menu", () => {
    expect(
      shouldSlashMenuCaptureEnter({
        hasMenu: true,
        commandCount: 12,
        hasQuery: false,
        hasExplicitSelection: true,
      }),
    ).toBe(true);
  });
});

describe("#267 end-to-end rule: bare slash opens the menu but never eats Enter", () => {
  it("a checklist item ending in a slash shows the menu yet leaves Enter alone", () => {
    const trigger = matchSlashTrigger("- [ ] ship it /");

    // The menu opens, so the command list is browsable...
    expect(trigger).not.toBeNull();
    expect(trigger?.query).toBe("");

    // ...but Enter still belongs to the document, so the item splits.
    expect(
      shouldSlashMenuCaptureEnter({
        hasMenu: true,
        commandCount: 12,
        hasQuery: (trigger?.query.length ?? 0) > 0,
      }),
    ).toBe(false);
  });

  it("once a command is typed, Enter accepts it", () => {
    const trigger = matchSlashTrigger("- [ ] ship it /tod");

    expect(trigger?.query).toBe("tod");
    expect(
      shouldSlashMenuCaptureEnter({
        hasMenu: true,
        commandCount: 1,
        hasQuery: (trigger?.query.length ?? 0) > 0,
      }),
    ).toBe(true);
  });
});
