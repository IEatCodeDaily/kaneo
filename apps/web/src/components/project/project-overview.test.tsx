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
