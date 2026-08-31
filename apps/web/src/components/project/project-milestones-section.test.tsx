import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectMilestonesSection from "./project-milestones-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/format", () => ({
  formatDateMedium: (date: string) => `date:${date}`,
}));

const completeMutate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const reopenMutate = vi.fn();
const canUpdateProjects = vi.fn();
const useMilestones = vi.fn();

vi.mock("@/hooks/queries/project/use-get-project-milestones", () => ({
  default: (projectId: string) => useMilestones(projectId),
}));
vi.mock("@/hooks/mutations/project/use-project-milestone-mutations", () => ({
  useCompleteProjectMilestone: () => ({ mutate: completeMutate }),
  useCreateProjectMilestone: () => ({ mutate: createMutate }),
  useUpdateProjectMilestone: () => ({ mutate: updateMutate }),
  useDeleteProjectMilestone: () => ({ mutate: deleteMutate }),
  useReopenProjectMilestone: () => ({ mutate: reopenMutate }),
}));
vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canUpdateProjects }),
}));
const useGetProject = vi.fn(() => ({
  data: { id: "project-1", viewerPrivilege: "manage" },
}));
vi.mock("@/hooks/queries/project/use-get-project", () => ({
  default: (args: { id: string }) => useGetProject(args),
}));

const milestones = [
  {
    id: "open",
    name: "Open",
    description: "Scope",
    targetDate: "2026-09-01",
    completedAt: null,
    progress: { percent: 50 },
  },
  {
    id: "closed",
    name: "Closed",
    description: null,
    targetDate: null,
    completedAt: "2026-08-01",
    progress: { percent: null },
  },
];

afterEach(() => {
  cleanup();
  completeMutate.mockClear();
  createMutate.mockClear();
  deleteMutate.mockClear();
  reopenMutate.mockClear();
  canUpdateProjects.mockReset();
  useMilestones.mockReset();
  useGetProject.mockReset();
  useGetProject.mockReturnValue({
    data: { id: "project-1", viewerPrivilege: "manage" },
  });
});

describe("ProjectMilestonesSection", () => {
  it("renders ordered server milestones and allows authorized create, lifecycle, and deletion", () => {
    canUpdateProjects.mockReturnValue(true);
    useMilestones.mockReturnValue({ data: milestones, isLoading: false });
    render(<ProjectMilestonesSection projectId="project-1" />);
    expect(useMilestones).toHaveBeenCalledWith("project-1");
    expect(
      screen.getAllByRole("strong").map((element) => element.textContent),
    ).toEqual(["Open", "Closed"]);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(
      screen.getByText("projects:milestones.noScopedWork"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("projects:milestones.name"), {
      target: { value: "New" },
    });
    fireEvent.click(screen.getByText("projects:milestones.add"));
    expect(createMutate).toHaveBeenCalledWith({
      projectId: "project-1",
      name: "New",
      description: null,
      targetDate: null,
      rank: 0,
    });
    fireEvent.click(screen.getByText("projects:milestones.complete"));
    expect(completeMutate).toHaveBeenCalledWith({
      projectId: "project-1",
      milestoneId: "open",
    });
    fireEvent.click(screen.getByText("projects:milestones.reopen"));
    expect(reopenMutate).toHaveBeenCalledWith({
      projectId: "project-1",
      milestoneId: "closed",
    });
    fireEvent.click(screen.getAllByText("projects:milestones.delete")[0]);
    fireEvent.click(
      screen.getAllByText("projects:milestones.delete").at(-1) as HTMLElement,
    );
    expect(deleteMutate).toHaveBeenCalledWith({
      projectId: "project-1",
      milestoneId: "open",
    });
  });

  it("withholds create and lifecycle controls without project update authority", () => {
    canUpdateProjects.mockReturnValue(false);
    useMilestones.mockReturnValue({ data: milestones, isLoading: false });
    render(<ProjectMilestonesSection projectId="project-1" />);
    expect(
      screen.queryByText("projects:milestones.add"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("projects:milestones.complete"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("projects:milestones.reopen"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("projects:milestones.delete"),
    ).not.toBeInTheDocument();
  });

  it("withholds controls when org permission is granted but effective privilege is view-only", () => {
    canUpdateProjects.mockReturnValue(true);
    useGetProject.mockReturnValue({
      data: { id: "project-1", viewerPrivilege: "view" },
    });
    useMilestones.mockReturnValue({ data: milestones, isLoading: false });
    render(<ProjectMilestonesSection projectId="project-1" />);
    expect(
      screen.queryByText("projects:milestones.add"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("projects:milestones.complete"),
    ).not.toBeInTheDocument();
  });

  it("renders loading and empty states", () => {
    canUpdateProjects.mockReturnValue(false);
    useMilestones.mockReturnValue({ data: [], isLoading: true });
    const { rerender } = render(
      <ProjectMilestonesSection projectId="project-1" />,
    );
    expect(screen.getByText("projects:milestones.loading")).toBeInTheDocument();
    useMilestones.mockReturnValue({ data: [], isLoading: false });
    rerender(<ProjectMilestonesSection projectId="project-1" />);
    expect(
      screen.getByText("projects:milestones.emptyDescription"),
    ).toBeInTheDocument();
  });
});
