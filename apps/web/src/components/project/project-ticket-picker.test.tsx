import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTicketPicker } from "./project-ticket-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const addMutate = vi.fn();
const assignMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/hooks/mutations/project/use-add-project-ticket", () => ({
  default: () => ({ mutate: addMutate }),
}));
vi.mock(
  "@/hooks/mutations/project/use-assign-project-ticket-milestone",
  () => ({
    default: () => ({ mutate: assignMutate }),
  }),
);
vi.mock("@/hooks/mutations/project/use-remove-project-ticket", () => ({
  default: () => ({ mutate: removeMutate }),
}));
vi.mock("@/hooks/queries/project/use-get-project-milestones", () => ({
  default: () => ({
    data: [
      { id: "milestone-1", name: "Launch", projectId: "project-1" },
      { id: "milestone-2", name: "Follow-up", projectId: "project-1" },
    ],
  }),
}));

const ticket = {
  id: "task-1",
  boardId: "board-1",
  boardSlug: "delivery",
  boardName: "Delivery",
  number: 1,
  key: "delivery-1",
  title: "Ship it",
  status: "to-do",
  priority: "high",
  archivedAt: null,
  projectMilestoneId: "milestone-1",
  rank: 0,
  addedAt: "2026-08-27T00:00:00.000Z",
  addedBy: "user-1",
};

afterEach(() => {
  cleanup();
  addMutate.mockClear();
  assignMutate.mockClear();
  removeMutate.mockClear();
});

describe("ProjectTicketPicker", () => {
  it("posts ticket membership and removes scoped tickets without optimistic changes", () => {
    render(<ProjectTicketPicker projectId="project-1" tickets={[ticket]} />);

    const input = screen.getByLabelText("projects:tickets.add");
    fireEvent.change(input, { target: { value: "task-2" } });
    fireEvent.click(screen.getByText("projects:tickets.add"));
    expect(addMutate).toHaveBeenCalledWith({
      id: "project-1",
      taskId: "task-2",
    });

    fireEvent.click(screen.getByText("projects:tickets.remove"));
    expect(removeMutate).toHaveBeenCalledWith({
      id: "project-1",
      taskId: "task-1",
    });
    expect(screen.getByText("delivery-1")).toBeInTheDocument();
  });

  it("assigns, reassigns, and clears only Project Milestones without optimistic state", () => {
    render(<ProjectTicketPicker projectId="project-1" tickets={[ticket]} />);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "milestone-2" },
    });
    expect(assignMutate).toHaveBeenLastCalledWith({
      projectId: "project-1",
      taskId: "task-1",
      projectMilestoneId: "milestone-2",
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "unassigned" },
    });
    expect(assignMutate).toHaveBeenLastCalledWith({
      projectId: "project-1",
      taskId: "task-1",
      projectMilestoneId: null,
    });

    // Mutation does not fabricate a reassigned value after an API rejection.
    expect(screen.getByText("Launch")).toBeInTheDocument();
  });
});
