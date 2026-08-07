import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findActiveTitleToken } from "@/lib/title-token-autocomplete";
import {
  TitleTokenHint,
  type TitleTokenOption,
  TitleTokenSuggestions,
} from "./title-token-suggestions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(() => {
  cleanup();
  // Portaled panels mount outside the RTL container, so cleanup() alone leaves
  // them behind and the next getByTestId resolves a stale duplicate.
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const labels: TitleTokenOption[] = [
  { id: "l1", name: "Bug", color: "#f00" },
  { id: "l2", name: "Backend", color: "#0f0" },
  { id: "l3", name: "frontend", color: "#00f" },
];

/** Mirrors how the modal derives the token from the live input value. */
const tokenFor = (title: string) => findActiveTitleToken(title, title.length);

function setup(title: string, options = labels) {
  const onCommit = vi.fn();
  const onDismiss = vi.fn();
  let keyHandler:
    | ((event: React.KeyboardEvent<HTMLInputElement>) => boolean)
    | null = null;

  const view = render(
    <TitleTokenSuggestions
      onCommit={onCommit}
      onDismiss={onDismiss}
      onRegisterKeyHandler={(handler) => {
        keyHandler = handler;
      }}
      options={options}
      token={tokenFor(title)}
    />,
  );

  // Simulates the title input forwarding a key to the picker. Each key is its
  // own React commit in the browser; act() reproduces that, otherwise the
  // handler re-registered by useEffect still closes over the old highlight.
  const press = (key: string) => {
    const event = {
      key,
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>;
    let handled = false;
    act(() => {
      handled = keyHandler?.(event) ?? false;
    });
    return { handled, event };
  };

  return { onCommit, onDismiss, press, view };
}

describe("#72 title token picker", () => {
  it("lists labels for a # token", () => {
    setup("Fix #b");
    expect(screen.getByTestId("title-token-suggestions")).toHaveAttribute(
      "data-token-kind",
      "label",
    );
    expect(
      screen.getAllByTestId("title-token-option").map((n) => n.textContent),
    ).toEqual(["Bug", "Backend"]);
  });

  it("renders nothing when there is no token", () => {
    setup("plain title");
    expect(screen.queryByTestId("title-token-suggestions")).toBeNull();
  });

  /**
   * NEGATIVE CONTROL for the ticket's explicit rule: "pressing space will treat
   * # as part of the title". After a space there is no token, so no picker.
   */
  it("closes after a space so the sigil stays plain text", () => {
    setup("Fix #bug ");
    expect(screen.queryByTestId("title-token-suggestions")).toBeNull();
  });

  it("commits the highlighted option on Enter and reports it handled", () => {
    const { onCommit, press } = setup("Fix #b");
    const { handled, event } = press("Enter");
    expect(handled).toBe(true);
    // Must swallow Enter, otherwise the create-task form submits instead.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledWith(labels[0]);
  });

  it("moves the highlight with the arrow keys before committing", () => {
    const { onCommit, press } = setup("Fix #b");
    press("ArrowDown");
    press("Enter");
    expect(onCommit).toHaveBeenCalledWith(labels[1]);
  });

  it("wraps the highlight upwards from the first row", () => {
    const { onCommit, press } = setup("Fix #b");
    press("ArrowUp");
    press("Enter");
    // Only Bug and Backend match "b", so wrapping lands on Backend.
    expect(onCommit).toHaveBeenCalledWith(labels[1]);
  });

  it("dismisses on Escape without committing", () => {
    const { onCommit, onDismiss, press } = setup("Fix #b");
    expect(press("Escape").handled).toBe(true);
    expect(onDismiss).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  // NEGATIVE CONTROL: keys the picker does not own must fall through to the
  // input, otherwise typing inside a token would be swallowed.
  it("does not handle Space or ordinary characters", () => {
    const { press } = setup("Fix #b");
    expect(press(" ").handled).toBe(false);
    expect(press("x").handled).toBe(false);
  });

  it("commits on click without stealing focus from the title input", () => {
    const { onCommit } = setup("Fix #b");
    const option = screen.getAllByTestId("title-token-option")[1];
    // mousedown must be prevented so the input keeps the caret.
    const mouseDown = fireEvent.mouseDown(option);
    expect(mouseDown).toBe(false);
    fireEvent.click(option);
    expect(onCommit).toHaveBeenCalledWith(labels[1]);
  });

  it("reports the user and priority kinds for @ and !", () => {
    const users = [{ id: "u1", name: "Ada" }];
    setup("Ship @a", users);
    expect(screen.getByTestId("title-token-suggestions")).toHaveAttribute(
      "data-token-kind",
      "user",
    );
    cleanup();
    setup("Ship !u", [{ id: "urgent", name: "Urgent" }]);
    expect(screen.getByTestId("title-token-suggestions")).toHaveAttribute(
      "data-token-kind",
      "priority",
    );
  });

  /**
   * #72 (second round): "make the popup an overlay and not an inline
   * component. right now when the popup shows up it increases the size of the
   * ticket creation modal."
   *
   * #266 updated this contract: the panel is now `fixed` and portaled rather
   * than `absolute` inside the modal body. Both satisfy "does not take part in
   * layout"; only the portal also escapes the body's overflow clipping.
   */
  it("overlays instead of taking part in layout", () => {
    setup("Fix #b");
    const panel = screen.getByTestId("title-token-suggestions");
    const classes = Array.from(panel.classList);
    // Whole tokens, not substrings: fixed removes it from flow, and it needs a
    // stacking context to sit above the modal body.
    expect(classes).toContain("fixed");
    expect(classes.some((c) => c.startsWith("z-"))).toBe(true);
  });

  it("does not open for a sigil inside a word", () => {
    setup("Port to C#");
    expect(screen.queryByTestId("title-token-suggestions")).toBeNull();
  });
});

describe("#72 discoverability hint", () => {
  it("tells the user the shortcuts exist", () => {
    render(<TitleTokenHint />);
    expect(screen.getByTestId("title-token-hint")).toBeInTheDocument();
  });

  /**
   * #72: hidden, but the line stays reserved. Unmounting it made the modal
   * shrink the instant the picker opened — the same resize complaint.
   */
  it("hides its text without collapsing its line", () => {
    render(<TitleTokenHint hidden />);
    expect(screen.queryByTestId("title-token-hint")).toBeNull();
    const reserved = screen.getByTestId("title-token-hint-hidden");
    expect(Array.from(reserved.classList)).toContain("invisible");
    expect(reserved).toHaveAttribute("aria-hidden", "true");
  });
});
