import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectOverview } from "./project-overview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "Apr 5, 2026",
}));

vi.mock("@/hooks/queries/project/use-get-latest-project-update", () => ({
  default: () => ({ data: null, isLoading: false }),
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
  progress: null,
  health: null,
  description: null,
  successCriteria: null,
};

/**
 * KFL-366: Project detail root RENDERS Overview directly (unlike Board's
 * `board/$boardSlug/index.tsx`, which redirects to Kanban). This component
 * IS that root — it must render the outcome summary and the presentation-
 * only "No scoped work" / "No update" empty states this ticket specifies,
 * since progress/health computation and ticket membership are out of scope.
 */
describe("ProjectOverview detail root", () => {
  it("renders the outcome summary", () => {
    render(<ProjectOverview project={baseProject} />);

    expect(screen.getByTestId("project-overview")).toBeInTheDocument();
    expect(screen.getByText("Ship the growth loop")).toBeInTheDocument();
  });

  it("renders 'No scoped work' when there is no success criteria or scoped work", () => {
    render(<ProjectOverview project={baseProject} />);

    expect(screen.getByText("projects:labels.noScopedWork")).toBeInTheDocument();
  });

  it("renders 'No update' since health is presentation-only and never persisted", () => {
    render(<ProjectOverview project={baseProject} />);

    expect(screen.getByText("projects:labels.noUpdate")).toBeInTheDocument();
  });

  it("renders the provided success criteria instead of the empty state when present", () => {
    render(
      <ProjectOverview
        project={{ ...baseProject, successCriteria: "Ship it" }}
      />,
    );

    expect(screen.getByText("Ship it")).toBeInTheDocument();
  });
});
