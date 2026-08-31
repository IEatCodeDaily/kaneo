import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsOverview } from "./projects-overview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/i18n", () => ({ i18n: { language: "en" } }));

vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/page-title", () => ({ default: () => null }));

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1", slug: "acme" } }),
}));

vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({
    canCreateProjects: () => true,
    canUpdateProjects: () => true,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/mutations/project/use-archive-project", () => ({
  default: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/mutations/project/use-unarchive-project", () => ({
  default: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/format", () => ({
  formatDateMedium: () => "Apr 5, 2026",
}));

const projectsByArchived: Record<string, unknown[]> = {
  false: [
    {
      id: "planned-1",
      slug: "planned-project",
      name: "Planned Project",
      summary: "Not started yet",
      status: "planned",
      priority: null,
      leadUserName: "Ada Lovelace",
      leadTeamName: null,
      startDate: null,
      targetDate: null,
      archivedAt: null,
      progress: null,
      health: null,
    },
    {
      id: "started-1",
      slug: "started-project",
      name: "Started Project",
      summary: "In flight",
      status: "started",
      priority: null,
      leadUserName: "Ada Lovelace",
      leadTeamName: null,
      startDate: null,
      targetDate: null,
      archivedAt: null,
      progress: null,
      health: null,
    },
    {
      id: "completed-1",
      slug: "completed-project",
      name: "Completed Project",
      summary: "Done",
      status: "completed",
      priority: null,
      leadUserName: "Ada Lovelace",
      leadTeamName: null,
      startDate: null,
      targetDate: null,
      archivedAt: null,
      progress: null,
      health: null,
    },
    {
      id: "canceled-1",
      slug: "canceled-project",
      name: "Canceled Project",
      summary: "Dropped",
      status: "canceled",
      priority: null,
      leadUserName: "Ada Lovelace",
      leadTeamName: null,
      startDate: null,
      targetDate: null,
      archivedAt: null,
      progress: null,
      health: null,
    },
  ],
  true: [
    {
      id: "archived-1",
      slug: "archived-project",
      name: "Archived Project",
      summary: "Shelved",
      status: "planned",
      priority: null,
      leadUserName: "Ada Lovelace",
      leadTeamName: null,
      startDate: null,
      targetDate: null,
      archivedAt: "2026-01-01T00:00:00.000Z",
      progress: null,
      health: null,
    },
  ],
};

const useGetProjectsMock = vi.fn(
  ({ includeArchived }: { includeArchived?: boolean }) => ({
    data: includeArchived
      ? [...projectsByArchived.false, ...projectsByArchived.true]
      : projectsByArchived.false,
    isLoading: false,
  }),
);

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: (args: { includeArchived?: boolean }) => useGetProjectsMock(args),
}));

vi.mock("./create-project-modal", () => ({
  default: () => null,
}));

afterEach(() => {
  useGetProjectsMock.mockClear();
  cleanup();
});

/**
 * KFL-366: the overview defaults to showing active (planned/started)
 * projects; completed/canceled show in a second section but archived
 * projects stay hidden until the includeArchived checkbox is checked.
 */
describe("ProjectsOverview default filter", () => {
  it("shows active and planned projects, and completed/canceled in a second section, with archived hidden by default", () => {
    render(<ProjectsOverview />);

    expect(screen.getByText("Planned Project")).toBeInTheDocument();
    expect(screen.getByText("Started Project")).toBeInTheDocument();
    expect(screen.getByText("Completed Project")).toBeInTheDocument();
    expect(screen.getByText("Canceled Project")).toBeInTheDocument();
    expect(screen.queryByText("Archived Project")).not.toBeInTheDocument();

    expect(useGetProjectsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );
  });

  it("reveals archived projects only after includeArchived is checked", () => {
    render(<ProjectsOverview />);

    expect(screen.queryByText("Archived Project")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(useGetProjectsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: true }),
    );
    expect(screen.getByText("Archived Project")).toBeInTheDocument();
  });
});
