import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #89: clicking a PR tab used to leave the user staring at the old panel until
 * the section's query resolved. These cases pin the optimistic behaviour: the
 * panel switches on click, a skeleton stands in while there is no data yet, and
 * cached data renders immediately with a "refreshing" affordance instead of
 * being blanked out.
 */

type QueryState = {
  data?: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
};

const idle: QueryState = {
  data: undefined,
  isError: false,
  isFetching: false,
  isLoading: false,
};

let filesState: QueryState = { ...idle };
let commitsState: QueryState = { ...idle };
let checksState: QueryState = { ...idle };

vi.mock("@/hooks/queries/repo/use-get-pull-request-files", () => ({
  default: () => filesState,
}));
vi.mock("@/hooks/queries/repo/use-get-pull-request-commits", () => ({
  default: () => commitsState,
}));
vi.mock("@/hooks/queries/repo/use-get-pull-request-checks", () => ({
  default: () => checksState,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { init: () => {}, type: "3rdParty" },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/repo/pull-request-reviews", () => ({
  default: () => <div>reviews</div>,
}));
vi.mock("@/components/repo/pull-request-file-tree", () => ({
  default: () => <div>file tree</div>,
}));
vi.mock("@pierre/diffs/react", () => ({
  PatchDiff: () => <div>patch</div>,
}));

import PullRequestLiveDetails from "./pull-request-live-details";

beforeEach(() => {
  filesState = { ...idle };
  commitsState = { ...idle };
  checksState = { ...idle };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDetails() {
  return render(
    <PullRequestLiveDetails
      discussion={<div>discussion body</div>}
      number={7}
      repoId="repo-1"
    />,
  );
}

describe("PullRequestLiveDetails optimistic tab switching (#89)", () => {
  it("activates the clicked tab immediately while its data is still loading", () => {
    commitsState = { ...idle, isFetching: true, isLoading: true };
    renderDetails();

    const commitsTab = screen.getByRole("tab", { name: "Commits" });
    expect(commitsTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(commitsTab);

    // No await, no act on a resolving promise: the tab is selected in the same
    // commit as the click even though the query is still in flight.
    expect(
      screen
        .getByRole("tab", { name: "Commits" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Discussions" })
        .getAttribute("aria-selected"),
    ).toBe("false");
  });

  it("shows a skeleton placeholder in the freshly opened tab", () => {
    commitsState = { ...idle, isFetching: true, isLoading: true };
    renderDetails();

    fireEvent.click(screen.getByRole("tab", { name: "Commits" }));

    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("renders cached rows with a refreshing hint instead of a skeleton", () => {
    commitsState = {
      data: {
        commits: [
          {
            authorLogin: "octocat",
            committedAt: null,
            message: "cached commit subject",
            sha: "abcdef1234567",
            url: "https://example.test/c",
          },
        ],
      },
      isError: false,
      isFetching: true,
      isLoading: false,
    };
    renderDetails();

    fireEvent.click(screen.getByRole("tab", { name: "Commits" }));

    expect(screen.getByText("cached commit subject")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
    // The hint text is translated, and this suite's t() mock returns the key,
    // so assert the key rather than English copy.
    expect(
      screen.getByText("organization:repos.pullRequests.refreshing"),
    ).toBeTruthy();
  });

  it("shows a progress indicator on the strip while the active tab refetches", () => {
    checksState = { ...idle, isFetching: true, isLoading: true };
    renderDetails();

    expect(screen.queryByTestId("pull-request-tab-progress")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Checks" }));

    expect(screen.getByTestId("pull-request-tab-progress")).toBeTruthy();
  });
});
