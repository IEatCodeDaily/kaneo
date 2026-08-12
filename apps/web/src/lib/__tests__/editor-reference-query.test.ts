import { describe, expect, it } from "vitest";
import {
  canOpenReferenceMenu,
  REFERENCE_MATCH_ALL_QUERY,
  shouldShowReferenceMenu,
  toReferenceSearchQuery,
} from "@/lib/editor-reference-query";

/**
 * #103: "opening task with a task mention inside opens a task mention modal".
 *
 * tiptap's Suggestion plugin re-matches the text around the selection on every
 * transaction. Hydrating a task whose description already contains `#3` was
 * enough to satisfy the `#` matcher, so the reference dropdown opened by itself
 * over the drawer — no one had typed anything.
 *
 * The fix gates the trigger on a focused, editable editor. Hydration runs while
 * the editor is unfocused, so the false open disappears without weakening the
 * genuine typing path (which still opens on a bare `#`).
 */

describe("canOpenReferenceMenu (#103)", () => {
  it("refuses to open while the editor is merely hydrating content", () => {
    // setContent() runs on an unfocused editor — the exact repro state.
    expect(canOpenReferenceMenu({ isFocused: false, isEditable: true })).toBe(
      false,
    );
  });

  it("refuses to open in a read-only editor", () => {
    expect(canOpenReferenceMenu({ isFocused: true, isEditable: false })).toBe(
      false,
    );
  });

  it("opens when a user is actually typing in an editable editor", () => {
    expect(canOpenReferenceMenu({ isFocused: true, isEditable: true })).toBe(
      true,
    );
  });

  it("treats a missing editor as not openable rather than throwing", () => {
    expect(
      canOpenReferenceMenu({} as { isFocused?: boolean; isEditable?: boolean }),
    ).toBe(false);
  });
});

describe("reference query mapping is unchanged by the gate", () => {
  it("still opens eagerly on a bare # once focus is satisfied", () => {
    // The gate is about WHEN the menu may open, not what it searches for.
    expect(shouldShowReferenceMenu("")).toBe(true);
    expect(toReferenceSearchQuery("")).toBe(REFERENCE_MATCH_ALL_QUERY);
  });

  it("passes a real query through trimmed", () => {
    expect(toReferenceSearchQuery("  login bug ")).toBe("login bug");
  });
});
