import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExternalLink } from "@/types/external-link";
import { ResourceSyncBadge } from "./resource-sync-badge";
import TaskSyncedIssueProperty from "./task-synced-issue-property";

/**
 * #75: Linked and Synced are different relationships.
 *
 *   Linked — "this ticket mentions this issue".
 *   Synced — "the content of this ticket is synced to this issue".
 *
 * A previous fix badged manually *linked* issues as Synced, overstating the
 * coupling, and a previous cleanup stubbed the synced-issue property out
 * entirely, dropping it from the drawer status bar where it belongs.
 */

const externalLinks: Partial<ExternalLink>[] = [];

vi.mock("@/hooks/queries/external-link/use-external-links", () => ({
  default: () => ({ data: externalLinks }),
}));

/** #75: a synced issue can also arrive as a repo-link with syncEnabled. */
const repoLinks: Array<Record<string, unknown>> = [];
vi.mock("@/hooks/queries/task/use-get-task-repo-links", () => ({
  default: () => ({ data: repoLinks }),
}));

/** #30: repositories connected to this organization. */
const connectedRepos: Array<Record<string, unknown>> = [];
vi.mock("@/hooks/queries/repo/use-get-repos", () => ({
  default: () => ({ data: connectedRepos, isPending: false }),
}));

/**
 * TanStack's Link needs a router. The synced-issue chip only has to prove
 * WHICH route it targets, so render it as an anchor exposing the resolved
 * in-app path.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    params,
    to,
    children,
    ...rest
  }: {
    params: Record<string, string>;
    to: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => {
    const href = Object.entries(params).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    );
    return (
      <a data-internal="true" href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

afterEach(() => {
  externalLinks.length = 0;
  repoLinks.length = 0;
  connectedRepos.length = 0;
  cleanup();
});

describe("#75 synced issue in the drawer status bar", () => {
  it("renders the canonical synced issue", () => {
    externalLinks.push({
      id: "l1",
      resourceType: "issue",
      externalId: "42",
      url: "https://github.com/acme/widgets/issues/42",
      title: "Broken widget",
    } as ExternalLink);

    render(<TaskSyncedIssueProperty compact taskId="task-1" />);

    const link = screen.getByTestId("task-synced-issue");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/issues/42",
    );
    expect(link.textContent).toContain("acme/widgets #42");
  });

  // NEGATIVE CONTROL: without this the component could render anything and the
  // assertion above would still pass on a hardcoded string.
  it("renders nothing when the task has no synced issue", () => {
    render(<TaskSyncedIssueProperty compact taskId="task-1" />);
    expect(screen.queryByTestId("task-synced-issue")).toBeNull();
  });

  /**
   * The regression you hit: "Create synced issue in repo" writes a repo-link
   * with syncEnabled and NO externalLink, so reading only externalLinks showed
   * nothing and Resources rendered it as a plain link.
   */
  it("shows a synced issue created via Create-synced-issue (repo link)", () => {
    repoLinks.push({
      id: "r1",
      itemType: "issues",
      syncEnabled: true,
      repoId: "repo-1",
      number: 27,
      title: "Created from Kaneo",
      state: "open",
      url: "https://github.com/acme/widgets/issues/27",
    });

    render(<TaskSyncedIssueProperty compact taskId="task-1" />);

    const link = screen.getByTestId("task-synced-issue");
    expect(link.textContent).toContain("acme/widgets #27");
  });

  // NEGATIVE CONTROL: a plain LINKED issue is not the synced issue.
  it("ignores a repo link that is not synced", () => {
    repoLinks.push({
      id: "r2",
      itemType: "issues",
      syncEnabled: false,
      repoId: "repo-1",
      number: 5,
      title: "Merely mentioned",
      state: "open",
      url: "https://github.com/acme/widgets/issues/5",
    });

    render(<TaskSyncedIssueProperty compact taskId="task-1" />);
    expect(screen.queryByTestId("task-synced-issue")).toBeNull();
  });

  it("does not treat a pull request or branch as the synced issue", () => {
    externalLinks.push(
      {
        id: "l2",
        resourceType: "pull_request",
        externalId: "7",
        url: "https://github.com/acme/widgets/pull/7",
      } as ExternalLink,
      {
        id: "l3",
        resourceType: "branch",
        externalId: "feat/x",
        url: "https://github.com/acme/widgets/tree/feat/x",
      } as ExternalLink,
    );

    render(<TaskSyncedIssueProperty compact taskId="task-1" />);
    expect(screen.queryByTestId("task-synced-issue")).toBeNull();
  });
});

describe("#30 synced issues open inside Kaneo when the repo is connected", () => {
  const syncedIssue = () =>
    externalLinks.push({
      id: "l30",
      resourceType: "issue",
      externalId: "42",
      url: "https://github.com/acme/widgets/issues/42",
      title: "Broken widget",
    } as ExternalLink);

  it("routes to the in-app repo issue page for a connected repository", () => {
    syncedIssue();
    connectedRepos.push({ id: "repo-9", owner: "acme", name: "widgets" });

    render(
      <TaskSyncedIssueProperty
        compact
        organizationId="org-1"
        taskId="task-1"
      />,
    );

    const link = screen.getByTestId("task-synced-issue");
    // The reported bug: this opened github.com in a new tab instead.
    expect(link).toHaveAttribute("data-internal", "true");
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/organization/org-1/repo/repo-9/issues/42",
    );
    expect(link).not.toHaveAttribute("target", "_blank");
  });

  // NEGATIVE CONTROL: an unconnected repository must still leave the app,
  // otherwise the assertion above would pass for a component that always
  // renders an internal link.
  it("keeps the GitHub link when the repository is not connected", () => {
    syncedIssue();
    connectedRepos.push({ id: "repo-other", owner: "acme", name: "unrelated" });

    render(
      <TaskSyncedIssueProperty
        compact
        organizationId="org-1"
        taskId="task-1"
      />,
    );

    const link = screen.getByTestId("task-synced-issue");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/issues/42",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("#75 the Synced badge means synced, not linked", () => {
  it("labels a synced issue", () => {
    render(<ResourceSyncBadge resourceType="issue" />);
    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("never labels pull requests or branches", () => {
    const view = render(<ResourceSyncBadge resourceType="pull_request" />);
    expect(screen.queryByText("Synced")).toBeNull();
    view.rerender(<ResourceSyncBadge resourceType="branch" />);
    expect(screen.queryByText("Synced")).toBeNull();
  });
});
