import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #30 (round 3): the auto-linked Resources row.
 *
 * Three separate surfaces link a task to its synced GitHub issue, and each had
 * to be fixed on its own:
 *   1. the repo issue page relations panel — already internal;
 *   2. the synced-issue chip in the drawer status bar;
 *   3. this row — the one the user actually clicks. It was hardcoded to
 *      `<a target="_blank">` pointing at github.com.
 *
 * These tests render the real TaskResources component so they fail if the fix
 * is reverted.
 */

const externalLinks: Array<Record<string, unknown>> = [];
const repoLinks: Array<Record<string, unknown>> = [];
const repos: Array<Record<string, unknown>> = [];

vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: () => ({ data: externalLinks }),
}));
vi.mock("@/hooks/queries/task/use-get-task-repo-links", () => ({
  default: () => ({ data: repoLinks }),
}));
vi.mock("@/hooks/queries/repo/use-get-repos", () => ({
  default: () => ({ data: repos, isPending: false }),
}));

// TaskResources pulls in the repo issue/PR pickers; those fetch on mount and are
// irrelevant to the routing decision under test.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useQueries: () => [],
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

/** Render TanStack Links as plain anchors exposing the resolved in-app path. */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    to,
    children,
    ...rest
  }: {
    params?: Record<string, string>;
    to: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    return (
      <a data-internal="true" href={href} {...rest}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
}));

import TaskResources from "./task-resources";

afterEach(() => {
  externalLinks.length = 0;
  repoLinks.length = 0;
  repos.length = 0;
  cleanup();
});

/** The integration writes an externalLink; no task_repo_item_link exists. */
function autoLinkedIssue() {
  externalLinks.push({
    id: "el-1",
    resourceType: "issue",
    externalId: "4",
    url: "https://github.com/acme/widgets/issues/4",
    title: "Check for Board-Issue sync",
    metadata: {},
  });
}

function row() {
  return screen.getByText("Check for Board-Issue sync").closest("a");
}

describe("#30 auto-linked Resources row", () => {
  it("opens inside Kaneo when the repository is connected", () => {
    autoLinkedIssue();
    repos.push({ id: "repo-9", owner: "acme", name: "widgets" });

    render(<TaskResources organizationId="org-1" taskId="task-1" />);

    const link = row();
    // The reported bug: this opened github.com in a new tab.
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/organization/org-1/repo/repo-9/issues/4",
    );
    expect(link).not.toHaveAttribute("target", "_blank");
  });

  // NEGATIVE CONTROL: an unconnected repo must still leave the app, or the
  // assertion above would pass for a row that is always internal.
  it("keeps the GitHub link when the repository is not connected", () => {
    autoLinkedIssue();
    repos.push({ id: "other", owner: "acme", name: "unrelated" });

    render(<TaskResources organizationId="org-1" taskId="task-1" />);

    const link = row();
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/issues/4",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  // Branches have no in-app page.
  it("never internalises a branch link", () => {
    externalLinks.push({
      id: "el-2",
      resourceType: "branch",
      externalId: "feat/x",
      url: "https://github.com/acme/widgets/tree/feat/x",
      title: "feat/x",
      metadata: {},
    });
    repos.push({ id: "repo-9", owner: "acme", name: "widgets" });

    render(<TaskResources organizationId="org-1" taskId="task-1" />);

    const link = screen.getByText("feat/x").closest("a");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
