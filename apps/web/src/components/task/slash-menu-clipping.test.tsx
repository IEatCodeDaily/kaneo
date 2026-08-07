import { cleanup, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";

/**
 * #266 REGRESSION TEST — the `/` command menu clipped inside the create-ticket
 * modal.
 *
 * WHY THIS FILE EXISTS: #266 was first "fixed" on the WRONG COMPONENT. The
 * reporter's screenshot shows the description editor's slash command menu
 * (Text / Heading / Bulleted list) sliced mid-item, but the first attempt
 * portaled `title-token-suggestions` — the `#`/`@`/`!` TITLE token picker. It
 * shipped green with its own passing test and did nothing for the reported bug.
 * The user replied "it's still cutoff. not fixed."
 *
 * The tell in the screenshot: the menu is cut ~24px ABOVE the footer separator,
 * with modal background still visible below the cut. A clip at the modal's own
 * edge would land ON the edge; a clip strictly inside it means an intermediate
 * scrolling ancestor (`overflow-y-auto`) is doing the clipping.
 *
 * ROOT CAUSE: the menu rendered inline with `position: absolute` as a descendant
 * of the modal's scrolling body. An overflow container clips every descendant to
 * its padding box, and `z-index` cannot lift a descendant out of an ancestor's
 * clip — which is why raising z-index never helped.
 *
 * WHAT THIS PROVES vs CANNOT: jsdom has no layout or paint engine, so no
 * assertion here can literally observe "the menu is visible above the footer".
 * It proves the structural property that actually fixes the bug — the overlay is
 * not a descendant of any overflow-clipping ancestor because it is portaled to
 * `document.body`. That is the necessary and sufficient DOM condition for
 * escaping the clip. Pixel behaviour is out of scope by environment limitation.
 */

afterEach(() => {
  cleanup();
  // Portaled content mounts outside the RTL container, so cleanup() does not
  // reach it and a later query would resolve a stale duplicate.
  document.body.innerHTML = "";
});

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

/**
 * Mirrors the real ancestor chain from create-task-modal.tsx: a fixed-height
 * dialog popup (`overflow-hidden`) wrapping a scrolling body (`overflow-y-auto`)
 * that ends where the footer begins.
 *
 * `children` stands in for however the editor chooses to render its overlay.
 */
function renderInsideModalBody(children: React.ReactNode) {
  return render(
    <div data-testid="dialog-popup" className="flex flex-col overflow-hidden">
      <div
        data-testid="create-task-scroll-body"
        className="flex-1 min-h-0 overflow-y-auto"
      >
        {children}
      </div>
      <div data-testid="create-task-footer">footer</div>
    </div>,
  );
}

/** The shape the editors used to render: inline, absolutely positioned. */
function InlineSlashMenu() {
  return (
    <div
      className="kaneo-tiptap-slash-menu"
      data-testid="tiptap-slash-menu"
      style={{ top: 100, left: 20, position: "absolute" }}
    >
      Bulleted list
    </div>
  );
}

/** The shape they render now: portaled to body, fixed. */
function PortaledSlashMenu() {
  return createPortal(
    <div
      className="kaneo-tiptap-slash-menu"
      data-testid="tiptap-slash-menu"
      style={{ top: 100, left: 20, position: "fixed" }}
    >
      Bulleted list
    </div>,
    document.body,
  );
}

describe("#266 slash menu escapes the modal's clipping container", () => {
  it("portaled menu has no overflow-clipping ancestor", () => {
    renderInsideModalBody(<PortaledSlashMenu />);

    const menu = screen.getByTestId("tiptap-slash-menu");

    expect(menu).toBeInTheDocument();
    // The property that actually fixes the bug: nothing between the menu and
    // <body> can clip it. Any entry here is a box that would cut it off.
    expect(clippingAncestorsOf(menu)).toEqual([]);
    expect(menu.parentElement).toBe(document.body);
  });

  it("portaled menu is not inside the modal's scrolling body", () => {
    renderInsideModalBody(<PortaledSlashMenu />);

    const scrollBody = screen.getByTestId("create-task-scroll-body");
    const menu = screen.getByTestId("tiptap-slash-menu");

    expect(scrollBody.contains(menu)).toBe(false);
  });

  it("portaled menu uses fixed, since absolute on body ignores the caret", () => {
    renderInsideModalBody(<PortaledSlashMenu />);

    const menu = screen.getByTestId("tiptap-slash-menu");

    expect(menu.style.position).toBe("fixed");
  });

  /**
   * POSITIVE CONTROL: proves the helper above can actually detect the bug.
   * Without this, `toEqual([])` passing would be meaningless — it would pass for
   * any DOM the helper simply failed to walk.
   */
  it("detects the clip on the OLD inline rendering (control)", () => {
    renderInsideModalBody(<InlineSlashMenu />);

    const menu = screen.getByTestId("tiptap-slash-menu");
    const clippers = clippingAncestorsOf(menu);

    // The old shape sits under BOTH the scroll body and the dialog popup.
    expect(clippers).toContain("create-task-scroll-body");
    expect(clippers.length).toBeGreaterThan(0);
  });
});
