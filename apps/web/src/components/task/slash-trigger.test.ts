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
 */
describe("matchSlashTrigger", () => {
  it("does not trigger on a bare trailing slash (the #267 bug)", () => {
    expect(matchSlashTrigger("ship it /")).toBeNull();
  });

  it("does not trigger on a slash alone at the start of a line", () => {
    expect(matchSlashTrigger("/")).toBeNull();
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
  it("captures Enter when the menu has commands", () => {
    expect(
      shouldSlashMenuCaptureEnter({ hasMenu: true, commandCount: 3 }),
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
});
