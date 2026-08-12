import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type Task from "@/types/task";
import TaskResourceIndicators, {
  getTaskResourceIndicators,
} from "./task-resource-indicators";

// Each case asserts on exact link counts, so the DOM must not accumulate
// between renders.
afterEach(cleanup);

const base = {
  id: "t",
  title: "Ticket",
  externalLinks: [],
  repoLinks: [],
} as unknown as Task;

function withResources(overrides: Partial<Task>) {
  return { ...base, ...overrides } as Task;
}

describe("#232 linked/synced Issue and PR indicators", () => {
  const repoLinks = [
    {
      id: "i",
      itemType: "issues" as const,
      number: 12,
      title: "Issue",
      url: "https://example/12",
      syncEnabled: false,
    },
    {
      id: "p",
      itemType: "pull-requests" as const,
      number: 14,
      title: "PR",
      url: "https://example/14",
      syncEnabled: false,
    },
    {
      id: "s",
      itemType: "issues" as const,
      number: 13,
      title: "Synced",
      url: "https://example/13",
      syncEnabled: true,
    },
  ];

  it("renders each resource as a real external link, not a button", () => {
    render(<TaskResourceIndicators task={withResources({ repoLinks })} />);

    // These are external destinations: they must be anchors so middle-click and
    // open-in-new-tab work. Asserting role=button here would be asserting a bug.
    const linked = screen.getByRole("link", { name: "Linked Issue #12" });
    expect(linked).toBeVisible();
    expect(linked).toHaveAttribute("href", "https://example/12");
    expect(linked).toHaveAttribute("target", "_blank");
    expect(linked).toHaveAttribute("rel", expect.stringContaining("noopener"));

    expect(screen.getByRole("link", { name: "Linked PR #14" })).toHaveAttribute(
      "href",
      "https://example/14",
    );
  });

  it("distinguishes a synced issue from a merely linked one", () => {
    render(<TaskResourceIndicators task={withResources({ repoLinks })} />);
    expect(
      screen.getByRole("link", { name: "Synced Issue #13" }),
    ).toBeVisible();
    // The linked issue must NOT be relabelled as synced.
    expect(
      screen.queryByRole("link", { name: "Synced Issue #12" }),
    ).not.toBeInTheDocument();
  });

  it("treats an externalLink issue as synced and a PR link as linked", () => {
    const resources = getTaskResourceIndicators(
      withResources({
        externalLinks: [
          {
            id: "e1",
            resourceType: "issue",
            externalId: "77",
            title: "Ext issue",
            url: "https://example/77",
          },
          {
            id: "e2",
            resourceType: "pull_request",
            externalId: "78",
            title: "Ext PR",
            url: "https://example/78",
          },
        ] as never,
      }),
    );
    expect(resources.find((r) => r.number === "77")?.synced).toBe(true);
    expect(resources.find((r) => r.number === "78")?.synced).toBe(false);
  });

  it("deduplicates resources that resolve to the same URL", () => {
    const resources = getTaskResourceIndicators(
      withResources({
        repoLinks: [repoLinks[0]],
        externalLinks: [
          {
            id: "dupe",
            resourceType: "issue",
            externalId: "12",
            title: "Same",
            url: "https://example/12",
          },
        ] as never,
      }),
    );
    expect(resources).toHaveLength(1);
  });

  it("drops resources with no usable url", () => {
    const resources = getTaskResourceIndicators(
      withResources({
        repoLinks: [{ ...repoLinks[0], url: "   " }],
      }),
    );
    expect(resources).toHaveLength(0);
  });

  it("overflows past the visible cap instead of rendering every chip", () => {
    render(
      <TaskResourceIndicators compact task={withResources({ repoLinks })} />,
    );
    // compact shows 2 of 3, so a "+1" counter must appear.
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("+1")).toBeVisible();
  });

  it("negative control: renders nothing when there are no resources", () => {
    const { container } = render(<TaskResourceIndicators task={base} />);
    expect(container).toBeEmptyDOMElement();
  });
});
