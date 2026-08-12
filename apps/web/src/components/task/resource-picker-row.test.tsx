import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The "Link issue or pull request" palette rows must show the item's provider
 * state (open/closed/merged/draft) so the user can tell live work from done
 * work before linking. Regression for: "it'd be great to see the issue/PR
 * status in the linking modal".
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").pop() as string,
  }),
}));

import ResourcePickerRow from "./resource-picker-row";

describe("ResourcePickerRow", () => {
  it("shows an open badge for an open issue", () => {
    render(
      <ResourcePickerRow
        item={{
          id: "r1-12",
          number: 12,
          title: "Fix the flux capacitor",
          repoId: "r1",
          repoLabel: "acme/widgets",
          state: "open",
          isDraft: null,
        }}
        itemType="issues"
      />,
    );
    expect(screen.getByText("#12")).toBeTruthy();
    const badge = screen.getByTestId("resource-picker-state-r1-12");
    expect(badge.textContent?.toLowerCase()).toContain("open");
  });

  it("shows a merged badge for a merged pull request", () => {
    render(
      <ResourcePickerRow
        item={{
          id: "r1-9",
          number: 9,
          title: "Ship it",
          repoId: "r1",
          repoLabel: "acme/widgets",
          state: "merged",
          isDraft: null,
        }}
        itemType="pull-requests"
      />,
    );
    const badge = screen.getByTestId("resource-picker-state-r1-9");
    expect(badge.textContent?.toLowerCase()).toContain("merged");
  });

  it("shows a draft badge for a draft pull request", () => {
    render(
      <ResourcePickerRow
        item={{
          id: "r1-4",
          number: 4,
          title: "WIP",
          repoId: "r1",
          repoLabel: "acme/widgets",
          state: "open",
          isDraft: true,
        }}
        itemType="pull-requests"
      />,
    );
    const badge = screen.getByTestId("resource-picker-state-r1-4");
    expect(badge.textContent?.toLowerCase()).toContain("draft");
  });
});
