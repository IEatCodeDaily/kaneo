import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavHiddenItems } from "./nav-hidden-items";

// This suite does not auto-cleanup between cases, so hidden-item rows from an
// earlier render leak into the next case and make both presence and absence
// assertions lie.
afterEach(cleanup);

vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuItem: ({
    children,
    ...props
  }: React.ComponentProps<"li"> & { children?: React.ReactNode }) => (
    <li {...props}>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    isActive,
    size: _size,
    ...props
  }: React.ComponentProps<"button"> & {
    isActive?: boolean;
    size?: string;
  }) => (
    <button data-active={isActive ? "true" : "false"} type="button" {...props}>
      {children}
    </button>
  ),
}));

const boards = [
  { id: "b1", name: "Archive" },
  { id: "b2", name: "Scratch" },
];

const renderMore = (
  props: Partial<React.ComponentProps<typeof NavHiddenItems>> = {},
) =>
  render(
    <NavHiddenItems
      items={boards}
      label="More Boards"
      onSelect={vi.fn()}
      testIdPrefix="boards"
      {...props}
    />,
  );

/**
 * Hidden boards/repos used to disappear from the sidebar entirely. They now
 * collapse behind a single "More Boards"/"More Repos" entry that expands in
 * place.
 */
describe("NavHiddenItems", () => {
  it("renders nothing when no items are hidden", () => {
    renderMore({ items: [] });

    expect(screen.queryByTestId("boards-more-item")).toBeNull();
    expect(screen.queryByTestId("boards-more-toggle")).toBeNull();
  });

  it("renders a collapsed More entry that hides the items until selected", () => {
    renderMore();

    const toggle = screen.getByTestId("boards-more-toggle");
    expect(toggle.textContent).toContain("More Boards");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Collapsed: the hidden items must not be in the DOM yet.
    expect(screen.queryByTestId("boards-more-entry-b1")).toBeNull();
    expect(screen.queryByTestId("boards-more-entry-b2")).toBeNull();
  });

  it("expands in place on selection and reveals every hidden item", () => {
    renderMore();

    fireEvent.click(screen.getByTestId("boards-more-toggle"));

    expect(
      screen.getByTestId("boards-more-toggle").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTestId("boards-more-entry-b1").textContent).toContain(
      "Archive",
    );
    expect(screen.getByTestId("boards-more-entry-b2").textContent).toContain(
      "Scratch",
    );
  });

  it("collapses again when the entry is selected a second time", () => {
    renderMore();

    fireEvent.click(screen.getByTestId("boards-more-toggle"));
    expect(screen.getByTestId("boards-more-entry-b1")).toBeTruthy();

    fireEvent.click(screen.getByTestId("boards-more-toggle"));
    expect(screen.queryByTestId("boards-more-entry-b1")).toBeNull();
  });

  it("navigates to a revealed hidden item without unhiding it", () => {
    const onSelect = vi.fn();
    renderMore({ onSelect });

    fireEvent.click(screen.getByTestId("boards-more-toggle"));
    fireEvent.click(screen.getByTestId("boards-more-entry-b2"));

    expect(onSelect).toHaveBeenCalledWith("b2");
    // Still expanded and still hidden from the main list.
    expect(screen.getByTestId("boards-more-entry-b2")).toBeTruthy();
  });

  it("marks the revealed hidden item active when it is the current one", () => {
    renderMore({ isActive: (id: string) => id === "b2" });

    fireEvent.click(screen.getByTestId("boards-more-toggle"));

    expect(
      screen.getByTestId("boards-more-entry-b1").getAttribute("data-active"),
    ).toBe("false");
    expect(
      screen.getByTestId("boards-more-entry-b2").getAttribute("data-active"),
    ).toBe("true");
  });

  it("namespaces testids per prefix so boards and repos never collide", () => {
    renderMore({
      items: [{ id: "r1", name: "kaneo" }],
      label: "More Repos",
      testIdPrefix: "repos",
    });

    fireEvent.click(screen.getByTestId("repos-more-toggle"));
    expect(screen.getByTestId("repos-more-entry-r1").textContent).toContain(
      "kaneo",
    );
    expect(screen.queryByTestId("boards-more-entry-r1")).toBeNull();
  });
});
