import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResourceSyncBadge } from "./resource-sync-badge";

afterEach(cleanup);

describe("ResourceSyncBadge", () => {
  it("labels the task's synced issue in the Resources list", () => {
    render(<ResourceSyncBadge resourceType="issue" />);
    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("does not mislabel pull requests or branches as synced issues", () => {
    const view = render(<ResourceSyncBadge resourceType="pull_request" />);
    expect(screen.queryByText("Synced")).toBeNull();

    view.rerender(<ResourceSyncBadge resourceType="branch" />);
    expect(screen.queryByText("Synced")).toBeNull();
  });
});
