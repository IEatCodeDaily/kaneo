import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MentionList, {
  type MentionListRef,
  type MentionMember,
} from "./mention-list";
import {
  createMentionSuggestionConfig,
  filterMentionMembers,
  MENTION_RESULT_LIMIT,
} from "./mention-suggestion";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const members: MentionMember[] = [
  { id: "u1", label: "Ada Lovelace" },
  { id: "u2", label: "Grace Hopper" },
  { id: "u3", label: "alan turing" },
];

type EditorState = { isFocused?: boolean; isEditable?: boolean };

function allowFor(editor: EditorState) {
  const config = createMentionSuggestionConfig(() => members);
  // biome-ignore lint/suspicious/noExplicitAny: suggestion `allow` takes the full tiptap props
  return Boolean(config.allow?.({ editor } as any));
}

describe("#114 @ mention suggestion config", () => {
  it("triggers on @ and does not span spaces", () => {
    const config = createMentionSuggestionConfig(() => members);
    expect(config.char).toBe("@");
    expect(config.allowSpaces).toBe(false);
  });

  it("opens for a focused, editable editor (the real typing path)", () => {
    expect(allowFor({ isFocused: true, isEditable: true })).toBe(true);
  });

  /**
   * NEGATIVE CONTROL (#103 regression guard, now for `@`).
   *
   * Hydrating a description that already contains an `@handle` runs the
   * matcher on a programmatic setContent while the editor is unfocused. If
   * this ever returns true, the mention dropdown pops open on task open —
   * exactly the bug #103 fixed for `#`.
   */
  it("refuses to open on an unfocused editor (hydration)", () => {
    expect(allowFor({ isFocused: false, isEditable: true })).toBe(false);
  });

  it("refuses to open in a read-only editor", () => {
    expect(allowFor({ isFocused: true, isEditable: false })).toBe(false);
  });

  it("refuses to open when focus state is unknown", () => {
    expect(allowFor({})).toBe(false);
  });

  it("lists members through items() for a focused editor", () => {
    const config = createMentionSuggestionConfig(() => members);
    // biome-ignore lint/suspicious/noExplicitAny: partial suggestion props
    const items = config.items?.({ query: "grace" } as any) as MentionMember[];
    expect(items.map((m) => m.id)).toEqual(["u2"]);
  });
});

describe("filterMentionMembers", () => {
  it("lists everyone for a bare @ (eager open)", () => {
    expect(filterMentionMembers(members, "").map((m) => m.id)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("matches case-insensitively on any part of the name", () => {
    expect(filterMentionMembers(members, "LOVE").map((m) => m.id)).toEqual([
      "u1",
    ]);
    expect(filterMentionMembers(members, "Alan").map((m) => m.id)).toEqual([
      "u3",
    ]);
  });

  // NEGATIVE CONTROL: a non-matching query must produce nothing, otherwise the
  // filter is a pass-through and every assertion above is meaningless.
  it("returns no members for a query nobody matches", () => {
    expect(filterMentionMembers(members, "zzzz")).toEqual([]);
  });

  it("caps the dropdown length", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `u${i}`,
      label: `Member ${i}`,
    }));
    expect(filterMentionMembers(many, "member")).toHaveLength(
      MENTION_RESULT_LIMIT,
    );
  });

  it("survives members with a missing label", () => {
    const withGap = [
      { id: "u9", label: undefined as unknown as string },
      ...members,
    ];
    expect(filterMentionMembers(withGap, "ada").map((m) => m.id)).toEqual([
      "u1",
    ]);
  });
});

describe("MentionList", () => {
  it("inserts the clicked member", () => {
    const command = vi.fn();
    render(<MentionList items={members} command={command} />);
    fireEvent.click(screen.getByText("Grace Hopper"));
    expect(command).toHaveBeenCalledWith(members[1]);
  });

  it("renders nothing when no member matches", () => {
    const { container } = render(<MentionList items={[]} command={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("selects with arrow keys plus enter", () => {
    const command = vi.fn();
    const ref = createRef<MentionListRef>();
    render(<MentionList ref={ref} items={members} command={command} />);
    // Each key is its own React commit in the browser; act() reproduces that,
    // otherwise Enter reads the pre-ArrowDown selection.
    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      });
    });
    act(() => {
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Enter" }),
      });
    });
    expect(command).toHaveBeenCalledWith(members[1]);
  });

  // NEGATIVE CONTROL: keys the list does not own must bubble back to the editor.
  it("does not swallow unrelated keys", () => {
    const ref = createRef<MentionListRef>();
    render(<MentionList ref={ref} items={members} command={vi.fn()} />);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "a" }),
      }),
    ).toBe(false);
  });
});
