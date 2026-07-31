import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PullRequestFileTree from "./pull-request-file-tree";

// This suite does not auto-cleanup between cases, so duplicate testids leak
// across renders without this.
afterEach(cleanup);

// `Button`'s base class already contains `before:absolute`, so a naive
// `toContain("absolute")` passes even when the element is not positioned. Match
// the standalone token instead.
const hasAbsoluteToken = (className: string) =>
  className.split(/\s+/).includes("absolute");

vi.mock("@pierre/trees/react", () => ({
  FileTree: ({ className }: { className?: string }) => (
    <div className={className} data-testid="pierre-file-tree" />
  ),
  useFileTree: () => ({
    model: {
      resetPaths: vi.fn(),
      getItem: vi.fn(() => ({ select: vi.fn() })),
    },
  }),
}));

/**
 * Layout contract for the changed-files tree, pinned after three user-reported
 * regressions:
 *
 * 1. A dismissing Popover closed on every file jump.
 * 2. An absolutely-positioned overlay floated on top of the code.
 * 3. In fullscreen, the diff column sized to its content so it never scrolled.
 *
 * The shape that works is GitHub's: a hideable in-flow column on the LEFT with
 * the diff beside it, and a resolved height so the virtualizer renders.
 */
describe("PullRequestFileTree layout", () => {
  const baseProps = {
    filenames: ["src/a.ts", "src/nested/b.ts"],
    selectedPath: "src/a.ts",
    onSelect: vi.fn(),
    idPrefix: "inline",
    onOpenChange: vi.fn(),
  };

  it("renders as an in-flow left column, never an overlay", () => {
    render(<PullRequestFileTree {...baseProps} open={true} />);

    const sidebar = screen.getByTestId("inline-file-tree-sidebar");
    // An absolutely-positioned panel floated on top of the code. It must be a
    // real column the diff sits beside.
    expect(hasAbsoluteToken(sidebar.className)).toBe(false);
    expect(sidebar.className).toContain("shrink-0");
    expect(within(sidebar).getByTestId("pierre-file-tree")).toBeTruthy();
  });

  it("gives the tree a resolved height so the virtualizer can render", () => {
    render(<PullRequestFileTree {...baseProps} open={true} />);
    // With only max-height the virtualized tree collapses to zero and blanks.
    expect(screen.getByTestId("inline-file-tree").className).toMatch(
      /h-\[|flex-1/,
    );
  });

  it("stretches to its parent in fullscreen instead of using viewport height", () => {
    render(<PullRequestFileTree {...baseProps} fillHeight open={true} />);
    const sidebar = screen.getByTestId("inline-file-tree-sidebar");
    expect(sidebar.className).toContain("h-full");
    expect(screen.getByTestId("inline-file-tree").className).toContain(
      "flex-1",
    );
  });

  it("collapses to a toggle that hides the tree body", () => {
    render(<PullRequestFileTree {...baseProps} open={false} />);

    expect(screen.getByTestId("inline-file-tree-toggle")).toBeTruthy();
    expect(screen.queryByTestId("inline-file-tree")).toBeNull();
  });

  it("reports the file count for screen readers when collapsed", () => {
    render(<PullRequestFileTree {...baseProps} open={false} />);
    expect(
      screen.getByTestId("inline-file-tree-toggle").getAttribute("title"),
    ).toContain("2 files");
  });
});
