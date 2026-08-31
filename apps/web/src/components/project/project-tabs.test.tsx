import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTabs } from "./project-tabs";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/common/view-tabs", () => ({
  ViewTabs: ({
    items,
    value,
  }: {
    items: Array<{ value: string; to?: string }>;
    value: string;
  }) => (
    <div data-testid="project-tabs" data-value={value}>
      {items.map((item) => (
        <button
          type="button"
          data-testid={`tab-${item.value}`}
          data-to={item.to}
          key={item.value}
        >
          {item.value}
        </button>
      ))}
    </div>
  ),
}));

afterEach(() => cleanup());

describe("ProjectTabs", () => {
  it("retains Overview root and navigates to the Tickets tab", () => {
    render(
      <ProjectTabs
        active="overview"
        organizationSlug="acme"
        projectSlug="growth"
      />,
    );

    expect(screen.getByTestId("project-tabs").getAttribute("data-value")).toBe(
      "overview",
    );
    expect(screen.getByTestId("tab-overview")).toBeInTheDocument();
    expect(screen.getByTestId("tab-tickets")).toBeInTheDocument();
    expect(screen.getByTestId("tab-tickets").getAttribute("data-to")).toContain(
      "/tickets",
    );
  });
});
