import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findActiveTitleToken } from "@/lib/title-token-autocomplete";
import {
  type TitleTokenOption,
  TitleTokenSuggestions,
} from "./title-token-suggestions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

afterEach(() => {
  cleanup();
  // Portal content mounts outside the RTL container, so cleanup() does not
  // reach it and a later query would resolve a stale duplicate.
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const labels: TitleTokenOption[] = [
  { id: "l1", name: "Bug", color: "#f00" },
  { id: "l2", name: "Backend", color: "#0f0" },
];

/**
 * #266 REGRESSION TEST
 *
 * Reported: "command popup being cutoff in create ticket modal" — the title
 * token picker was clipped by the create-task modal's footer.
 *
 * Root cause: the picker rendered INLINE inside the modal's scrolling body,
 * `<div class="flex-1 min-h-0 overflow-y-auto ...">`. An `overflow-y-auto`
 * box clips every descendant to its padding box, and `z-index` cannot lift a
 * descendant out of that clip — so the panel was cut where the scroll body
 * ended, i.e. exactly at the footer's top edge.
 *
 * WHAT THIS TEST CAN AND CANNOT PROVE
 * jsdom has no layout or paint engine: it cannot compute real clipping or
 * paint order, so no jsdom assertion can literally observe "the popup is
 * visible above the footer". What it CAN prove — and what actually fixes the
 * bug — is the STRUCTURAL property: the panel is not a descendant of any
 * overflow-clipping ancestor, because it is portaled to document.body. That
 * is the necessary and sufficient DOM condition for the clip to be escaped.
 * The remaining pixel-level behaviour is out of scope here by environment
 * limitation, not by choice.
 */

/** Mirrors how the modal derives the token from the live input value. */
const tokenFor = (title: string) => findActiveTitleToken(title, title.length);

/**
 * Reproduces the real ancestor chain from create-task-modal.tsx: a fixed-height
 * dialog popup (`overflow-hidden`) wrapping a scrolling body
 * (`overflow-y-auto`) that ends where the footer begins.
 */
function renderInsideModalBody(title: string) {
  return render(
    <div data-testid="dialog-popup" className="flex flex-col overflow-hidden">
      <div
        data-testid="create-task-scroll-body"
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="relative h-0">
          <TitleTokenSuggestions
            onCommit={vi.fn()}
            onDismiss={vi.fn()}
            options={labels}
            token={tokenFor(title)}
          />
        </div>
      </div>
      <div data-testid="create-task-footer">footer</div>
    </div>,
  );
}

/** Every ancestor whose class list declares an overflow clip. */
function clippingAncestorsOf(element: HTMLElement): string[] {
  const found: string[] = [];
  let node = element.parentElement;
  while (node && node !== document.body) {
    const clips = Array.from(node.classList).some(
      (c) =>
        c === "overflow-hidden" ||
        c === "overflow-auto" ||
        c === "overflow-y-auto" ||
        c === "overflow-x-auto" ||
        c === "overflow-clip" ||
        c === "overflow-scroll" ||
        c === "overflow-y-scroll",
    );
    if (clips) found.push(node.dataset.testid ?? node.className);
    node = node.parentElement;
  }
  return found;
}

describe("#266 title token picker escapes the modal's clipping container", () => {
  it("does not render inside the modal's scrolling body", () => {
    renderInsideModalBody("Fix #b");

    const scrollBody = screen.getByTestId("create-task-scroll-body");
    const panel = screen.getByTestId("title-token-suggestions");

    // The panel exists...
    expect(panel).toBeInTheDocument();
    // ...but NOT under the overflow container that used to cut it off.
    expect(scrollBody.contains(panel)).toBe(false);
  });

  it("has no overflow-clipping ancestor at all", () => {
    renderInsideModalBody("Fix #b");

    const panel = screen.getByTestId("title-token-suggestions");

    // This is the property that actually fixes the bug: nothing between the
    // panel and <body> can clip it. Any entry here is a box that would cut
    // the popup off in a real browser.
    expect(clippingAncestorsOf(panel)).toEqual([]);
  });

  it("mounts the panel as a direct child of document.body", () => {
    renderInsideModalBody("Fix #b");

    const panel = screen.getByTestId("title-token-suggestions");

    expect(panel.parentElement).toBe(document.body);
  });

  it("leaves the in-flow anchor behind so the panel can still be positioned", () => {
    renderInsideModalBody("Fix #b");

    const scrollBody = screen.getByTestId("create-task-scroll-body");
    const anchor = screen.getByTestId("title-token-suggestions-anchor");

    // The anchor stays where the picker used to be (inside the scroll body);
    // only the visible panel escapes. Without it the portaled panel would have
    // nothing to measure against and would land in the corner of the viewport.
    expect(scrollBody.contains(anchor)).toBe(true);
    // Zero-height, so it cannot reintroduce the "#72 modal resizes" bug.
    expect(Array.from(anchor.classList)).toContain("h-0");
  });

  it("is positioned out of flow so it overlays rather than pushes the footer", () => {
    renderInsideModalBody("Fix #b");

    const panel = screen.getByTestId("title-token-suggestions");

    // `fixed` (not `absolute`) is required once portaled: an absolute panel on
    // <body> would be offset from the page, not from the title input.
    expect(Array.from(panel.classList)).toContain("fixed");
  });

  /**
   * NEGATIVE CONTROL for the queries themselves: with no active token the
   * picker renders nothing, so the assertions above are reacting to a real
   * mounted panel rather than passing vacuously.
   */
  it("renders no panel and no anchor when there is no token", () => {
    renderInsideModalBody("plain title");

    expect(screen.queryByTestId("title-token-suggestions")).toBeNull();
    expect(screen.queryByTestId("title-token-suggestions-anchor")).toBeNull();
  });
});
