import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectOverview } from "./project-overview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "Apr 5, 2026",
}));

vi.mock("./project-milestones-section", () => ({
  default: () => null,
}));

vi.mock("./project-contextual-resources", () => ({
  default: () => <div data-testid="project-contextual-resources" />,
}));
afterEach(() => cleanup());

const baseProject = {
  id: "project-1",
  slug: "growth",
  name: "Growth Initiative",
  summary: "Ship the growth loop",
  status: "started" as const,
  priority: "high",
  leadUserName: "Ada Lovelace",
  leadTeamName: null,
  startDate: null,
  targetDate: null,
  archivedAt: null,
  health: null,
  description: null,
  successCriteria: null,
};

describe("ProjectOverview detail root", () => {
  it("renders the outcome summary", () => {
    render(
      <ProjectOverview
        project={{
          ...baseProject,
          progress: { completed: 0, eligible: 0, percent: null },
        }}
      />,
    );
        organizationId="org-1"
        organizationSlug="org-slug"
        project={baseProject}
      />,
    );

    expect(screen.getByTestId("project-overview")).toBeInTheDocument();
    expect(screen.getByText("Ship the growth loop")).toBeInTheDocument();
  });

  it("renders derived completed/eligible progress when percent is present", () => {
    render(
      <ProjectOverview
        project={{
          ...baseProject,
          progress: { completed: 1, eligible: 2, percent: 50 },
        }}
  it("renders 'No scoped work' when there is no success criteria or scoped work", () => {
    render(
      <ProjectOverview
        organizationId="org-1"
        organizationSlug="org-slug"
        project={baseProject}
      />,
    );

    // "projects:labels.noScopedWork" appears for BOTH the success-criteria
    // fallback and the dedicated scoped-work section — this ticket persists
    // neither, so both must fall back to the same empty-state copy.
    const noScopedWork = screen.getAllByText("projects:labels.noScopedWork");
    expect(noScopedWork.length).toBeGreaterThanOrEqual(2);
  });

  it("renders 'No update' since health is presentation-only and never persisted", () => {
    render(
      <ProjectOverview
        organizationId="org-1"
        organizationSlug="org-slug"
        project={baseProject}
      />,
    );

    expect(
      screen.getAllByText("projects:labels.noUpdate").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders the provided success criteria instead of the empty state when present", () => {
    render(
      <ProjectOverview
        organizationId="org-1"
        organizationSlug="org-slug"
        project={{ ...baseProject, successCriteria: "Ship it" }}
      />,
    );
    expect(
      screen.getByText("projects:progress.completedOfEligible"),
    ).toBeInTheDocument();
  });

  it("renders No scoped work only when percent is null", () => {
    render(
      <ProjectOverview
        project={{
          ...baseProject,
          progress: { completed: 0, eligible: 0, percent: null },
        }}
      />,
    );
    expect(
      screen.getByText("projects:progress.noScopedWork"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("projects:progress.completedOfEligible"),
    ).toBeNull();
  });
});
