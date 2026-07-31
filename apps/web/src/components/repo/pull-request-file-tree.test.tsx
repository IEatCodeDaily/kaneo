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
 * The tree must FLOAT over the diff, not take a column from it.
 *
 * A previous version docked it as an in-flow flex child. That both stole width
 * from the diff and, in the fullscreen dialog, left the diff column sized to its
 * content so it could never scroll. Both regressions were user-reported, so
 * these assertions pin the layout contract.
 */
describe("PullRequestFileTree layout", () => {
  const baseProps = {
    filenames: ["src/a.ts", "src/nested/b.ts"],
    selectedPath: "src/a.ts",
    onSelect: vi.fn(),
    idPrefix: "inline",
    onOpenChange: vi.fn(),
  };

  it("floats the open panel as an absolute overlay", () => {
    render(<PullRequestFileTree {...baseProps} open={true} />);

    const sidebar = screen.getByTestId("inline-file-tree-sidebar");
    // Absolute positioning is what makes it float over the diff. `shrink-0` in
    // normal flow (the old behaviour) reserved a column instead.
    expect(hasAbsoluteToken(sidebar.className)).toBe(true);
    expect(sidebar.className).not.toContain("shrink-0");
    expect(within(sidebar).getByTestId("pierre-file-tree")).toBeTruthy();
  });

  it("floats the collapsed toggle too, so collapsing does not shift the diff", () => {
    render(<PullRequestFileTree {...baseProps} open={false} />);

    const toggle = screen.getByTestId("inline-file-tree-toggle");
    expect(hasAbsoluteToken(toggle.className)).toBe(true);
    // Collapsed state must not render the tree body.
    expect(screen.queryByTestId("inline-file-tree")).toBeNull();
  });

  it("reports file count on the collapsed toggle", () => {
    render(<PullRequestFileTree {...baseProps} open={false} />);
    expect(screen.getByTestId("inline-file-tree-toggle").textContent).toContain(
      "2 files",
    );
  });
});
