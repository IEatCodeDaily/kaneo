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

afterEach(() => {
  externalLinks.length = 0;
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
