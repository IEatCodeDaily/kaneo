import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const linkProps: Record<string, unknown>[] = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...rest
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    linkProps.push(rest);
    return (
      <a data-testid="row-link" href="/repos/test">
        {children}
      </a>
    );
  },
}));

import RepoListRow from "./repo-list-row";

afterEach(() => {
  cleanup();
  linkProps.length = 0;
});

/**
 * #94: opening a closed issue snapped the list back to the "open" filter.
 *
 * The list's state filter lives in the URL and the detail route's
 * validateSearch defaults it to "open", so a row that navigates without
 * carrying `search` silently resets the user's filter. These cases pin the
 * forwarding rather than the visual row, because the bug was invisible in the
 * rendered markup.
 */
describe("RepoListRow search forwarding (#94)", () => {
  const baseProps = {
    icon: <span />,
    title: "Some issue",
    number: 42,
    state: "closed" as const,
    labels: [],
    to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number",
    params: { organizationSlug: "org-1", repoId: "repo-1", number: "42" },
  };

  it("forwards the active state filter to the detail route", () => {
    render(<RepoListRow {...baseProps} search={{ state: "closed" }} />);

    expect(screen.getByTestId("row-link")).toBeTruthy();
    expect(linkProps[0]?.search).toEqual({ state: "closed" });
  });

  it("forwards whichever filter is active, not a hardcoded one", () => {
    render(<RepoListRow {...baseProps} search={{ state: "all" }} />);

    expect(linkProps[0]?.search).toEqual({ state: "all" });
  });

  it("still renders without search so other lists are unaffected", () => {
    render(<RepoListRow {...baseProps} />);

    expect(screen.getByTestId("row-link")).toBeTruthy();
    expect(linkProps[0]?.search).toBeUndefined();
  });

  it("passes route params through unchanged", () => {
    render(<RepoListRow {...baseProps} search={{ state: "closed" }} />);

    expect(linkProps[0]?.params).toEqual({
      organizationSlug: "org-1",
      repoId: "repo-1",
      number: "42",
    });
  });
});
