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

/**
 * Captures the paths handed to `@pierre/trees`, which is the only observable
 * evidence of the foldering step: the real virtualizer is mocked out, so the
 * nesting contract has to be asserted on the model input.
 */
const resetPathsCalls: string[][] = [];

vi.mock("@pierre/trees/react", () => ({
  FileTree: ({ className }: { className?: string }) => (
    <div className={className} data-testid="pierre-file-tree" />
  ),
  useFileTree: () => ({
    model: {
      resetPaths: vi.fn((paths: string[]) => {
        resetPathsCalls.push(paths);
      }),
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

/**
 * The "foldered" half of the feature. `@pierre/trees` only nests children when
 * the directory entries are present in the path list, so a bare list of file
 * paths renders as a flat dump. These cases pin the synthesis of those
 * directory entries.
 */
describe("PullRequestFileTree foldering", () => {
  const baseProps = {
    selectedPath: undefined,
    onSelect: vi.fn(),
    idPrefix: "folders",
    onOpenChange: vi.fn(),
    open: true,
  };

  const lastPaths = () => resetPathsCalls[resetPathsCalls.length - 1] ?? [];

  it("synthesizes every ancestor directory so deep files nest", () => {
    resetPathsCalls.length = 0;
    render(
      <PullRequestFileTree
        {...baseProps}
        filenames={["apps/web/src/deep/file.ts"]}
      />,
    );

    const paths = lastPaths();
    // Each level must appear, not just the immediate parent, or the tree
    // renders orphaned branches.
    expect(paths).toContain("apps/");
    expect(paths).toContain("apps/web/");
    expect(paths).toContain("apps/web/src/");
    expect(paths).toContain("apps/web/src/deep/");
    expect(paths).toContain("apps/web/src/deep/file.ts");
  });

  it("marks directories with a trailing slash and lists them before files", () => {
    resetPathsCalls.length = 0;
    render(
      <PullRequestFileTree
        {...baseProps}
        filenames={["src/b.ts", "src/nested/c.ts", "root.ts"]}
      />,
    );

    const paths = lastPaths();
    const directories = paths.filter((p) => p.endsWith("/"));
    const files = paths.filter((p) => !p.endsWith("/"));

    expect(directories).toEqual(["src/", "src/nested/"]);
    // Directories must precede files: the tree builds parents as it walks.
    const lastDirectoryIndex = paths.lastIndexOf(
      directories[directories.length - 1],
    );
    const firstFileIndex = paths.indexOf(files[0]);
    expect(lastDirectoryIndex).toBeLessThan(firstFileIndex);
  });

  it("does not invent a directory for a file at the repository root", () => {
    resetPathsCalls.length = 0;
    render(<PullRequestFileTree {...baseProps} filenames={["README.md"]} />);

    expect(lastPaths()).toEqual(["README.md"]);
  });

  it("deduplicates directories shared by sibling files", () => {
    resetPathsCalls.length = 0;
    render(
      <PullRequestFileTree
        {...baseProps}
        filenames={["src/one.ts", "src/two.ts", "src/three.ts"]}
      />,
    );

    const paths = lastPaths();
    expect(paths.filter((p) => p === "src/")).toHaveLength(1);
  });
});
