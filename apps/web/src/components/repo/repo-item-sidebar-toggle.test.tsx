import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RepoItemDetailLayout,
  type RepoItemKind,
  type RepoItemManagementProps,
} from "@/components/repo/repo-item-detail-layout";

/**
 * Regression: the metadata sidebar on the issue and pull request detail pages
 * had NO hide/show control. `hideSidebar` existed but was only ever set by the
 * PR diff view, so a reader could never reclaim the width themselves — the
 * board header has had a properties toggle for a while and these two surfaces
 * silently lacked the equivalent.
 *
 * Both surfaces are asserted, because they are two separate routes rendering
 * one shared shell and a fix applied to a single route would leave the other
 * broken.
 */

vi.mock("@/components/repo/repo-detail-management", () => ({
  RepoIssueSidebar: () => (
    <aside id="repo-item-metadata-sidebar">metadata sidebar</aside>
  ),
}));
vi.mock("@/components/repo/repo-item-actions", () => ({
  RepoItemHeaderActions: () => <div>header actions</div>,
  RepoItemCommentComposer: () => <div>composer</div>,
}));
vi.mock("@/components/repo/repo-description-editor", () => ({
  RepoDescriptionEditor: () => <div>description</div>,
}));

function renderLayout(kind: RepoItemKind, hideSidebar = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // The shell only forwards these to the mocked sidebar/actions components.
  const management = {
    kind: kind === "issue" ? "issue" : "pull-request",
    labels: [],
    number: 1,
    organizationId: "org-1",
    repoId: "repo-1",
    state: "open",
    title: "Item title",
  } as unknown as RepoItemManagementProps;

  return render(
    <RepoItemDetailLayout
      body="body"
      commentCount={0}
      header={<h1>Item title</h1>}
      hideSidebar={hideSidebar}
      kind={kind}
      management={management}
      number={1}
      onBack={() => {}}
      organizationId="org-1"
      repoId="repo-1"
    />,
    { wrapper },
  );
}

afterEach(cleanup);

describe.each<RepoItemKind>(["issue", "pull-request"])(
  "RepoItemDetailLayout sidebar toggle (%s)",
  (kind) => {
    it("renders the sidebar and its toggle by default", () => {
      renderLayout(kind);

      expect(screen.getByTestId("repo-item-sidebar-toggle")).toBeTruthy();
      expect(screen.getByText("metadata sidebar")).toBeTruthy();
    });

    it("hides the sidebar when toggled and restores it when toggled back", () => {
      renderLayout(kind);
      const toggle = screen.getByTestId("repo-item-sidebar-toggle");

      expect(toggle.getAttribute("aria-expanded")).toBe("true");

      fireEvent.click(toggle);
      expect(screen.queryByText("metadata sidebar")).toBeNull();
      expect(
        screen
          .getByTestId("repo-item-sidebar-toggle")
          .getAttribute("aria-expanded"),
      ).toBe("false");

      fireEvent.click(screen.getByTestId("repo-item-sidebar-toggle"));
      expect(screen.getByText("metadata sidebar")).toBeTruthy();
    });

    it("points aria-controls at the sidebar it actually toggles", () => {
      const { container } = renderLayout(kind);
      const toggle = screen.getByTestId("repo-item-sidebar-toggle");

      const controlled = toggle.getAttribute("aria-controls");
      expect(controlled).toBe("repo-item-metadata-sidebar");
      expect(container.querySelector(`#${controlled}`)).toBeTruthy();
    });
  },
);

describe("RepoItemDetailLayout diff view", () => {
  it("keeps the sidebar force-hidden and offers no toggle", () => {
    // The diff owns the full width; a toggle there would fight hideSidebar.
    renderLayout("pull-request", true);

    expect(screen.queryByText("metadata sidebar")).toBeNull();
    expect(screen.queryByTestId("repo-item-sidebar-toggle")).toBeNull();
  });
});
