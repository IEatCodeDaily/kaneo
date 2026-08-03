import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoardPropertiesPanel from "./board-properties-panel";

const mocks = vi.hoisted(() => ({
  milestones: [] as Array<{
    id: string;
    name: string;
    status: string;
    boardId?: string;
    dueDate?: string | null;
  }>,
  members: [] as Array<{ id: string; role: string; user: { name: string } }>,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  updateBoard: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/milestone/use-get-milestones-by-board", () => ({
  default: () => ({ data: mocks.milestones, isLoading: false }),
}));

vi.mock("@/hooks/mutations/milestone/use-create-milestone", () => ({
  default: () => ({ mutateAsync: mocks.create, isPending: false }),
}));

vi.mock("@/hooks/mutations/milestone/use-update-milestone", () => ({
  default: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

vi.mock("@/hooks/mutations/milestone/use-delete-milestone", () => ({
  default: () => ({ mutateAsync: mocks.remove, isPending: false }),
}));

vi.mock("@/hooks/mutations/board/use-update-board", () => ({
  default: () => ({ mutateAsync: mocks.updateBoard, isPending: false }),
}));

vi.mock(
  "@/hooks/queries/organization-members/use-get-active-organization-members",
  () => ({
    useGetActiveOrganizationMembers: () => ({
      // Real payload shape: an OBJECT with `members`, not a bare array.
      data: { members: mocks.members, total: mocks.members.length },
    }),
  }),
);

vi.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

const board = {
  id: "board-1",
  name: "Roadmap",
  description: "Ship it",
  icon: "Layout",
  slug: "roadmap",
  isPublic: false,
};

const tasks = [
  {
    id: "t1",
    milestoneId: "m-1",
    status: "done",
    startDate: "2026-05-01T00:00:00.000Z",
    dueDate: "2026-05-04T00:00:00.000Z",
  },
  {
    id: "t2",
    milestoneId: "m-1",
    status: "to-do",
    startDate: null,
    dueDate: "2026-05-20T00:00:00.000Z",
  },
];

function renderPanel() {
  return render(
    <BoardPropertiesPanel
      open
      onClose={() => {}}
      board={board}
      organizationId="org-1"
      tasks={tasks}
    />,
  );
}

describe("BoardPropertiesPanel", () => {
  afterEach(() => {
    mocks.milestones.length = 0;
    mocks.members.length = 0;
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
    mocks.updateBoard.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    cleanup();
  });

  it("shows the board name and description for editing", () => {
    renderPanel();

    expect(screen.getByTestId("board-properties-name-input")).toHaveValue(
      "Roadmap",
    );
    expect(
      screen.getByTestId("board-properties-description-input"),
    ).toHaveValue("Ship it");
  });

  it("lists the organization members with access", () => {
    mocks.members.push({
      id: "mem-1",
      role: "admin",
      user: { name: "Ada Lovelace" },
    });

    renderPanel();

    expect(screen.getByTestId("board-properties-members")).toHaveTextContent(
      "Ada Lovelace",
    );
  });

  it("lists the board's milestones", () => {
    mocks.milestones.push(
      { id: "m-1", name: "Beta", status: "active" },
      { id: "m-2", name: "GA", status: "planned" },
    );

    renderPanel();

    expect(screen.getByTestId("board-milestone-m-1")).toHaveTextContent("Beta");
    expect(screen.getByTestId("board-milestone-m-2")).toHaveTextContent("GA");
  });

  it("renders each milestone's progress and date range inferred from its tasks", () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "active" });

    renderPanel();

    // 1 of 2 related tasks done.
    expect(
      screen.getByTestId("board-milestone-progress-m-1"),
    ).toHaveTextContent("50%");
    expect(
      screen.getByTestId("board-milestone-range-m-1"),
    ).not.toHaveTextContent("milestone.manage.noDates");
  });

  it("creates a milestone scoped to the board", async () => {
    mocks.create.mockResolvedValue({ id: "m-new" });

    renderPanel();

    fireEvent.click(screen.getByTestId("board-milestone-add"));
    fireEvent.change(screen.getByTestId("board-milestone-name-input"), {
      target: { value: "Launch" },
    });
    fireEvent.change(screen.getByTestId("board-milestone-due-date-input"), {
      target: { value: "2026-06-30" },
    });
    fireEvent.click(screen.getByTestId("board-milestone-create-submit"));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "board-1",
        name: "Launch",
        dueDate: "2026-06-30",
      }),
    );
  });

  it("edits an explicit due date without hiding the inferred task range", () => {
    mocks.milestones.push({
      id: "m-1",
      name: "Beta",
      status: "active",
      dueDate: "2026-06-15",
    });
    mocks.update.mockResolvedValue({});
    renderPanel();

    expect(screen.getByTestId("board-milestone-due-m-1")).toHaveTextContent(
      "2026-06-15",
    );
    expect(screen.getByTestId("board-milestone-range-m-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("board-milestone-edit-m-1"));
    fireEvent.change(screen.getByTestId("board-milestone-due-date-m-1"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.keyDown(screen.getByTestId("board-milestone-rename-m-1"), {
      key: "Enter",
    });

    expect(mocks.update).toHaveBeenCalledWith({
      boardId: "board-1",
      id: "m-1",
      name: "Beta",
      dueDate: "2026-07-01",
    });
  });

  it("deletes a milestone", () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "active" });
    mocks.remove.mockResolvedValue({});

    renderPanel();

    fireEvent.click(screen.getByTestId("board-milestone-delete-m-1"));

    expect(mocks.remove).toHaveBeenCalledWith({
      boardId: "board-1",
      id: "m-1",
    });
  });

  it("updates a milestone status", () => {
    mocks.milestones.push({ id: "m-1", name: "Beta", status: "planned" });
    mocks.update.mockResolvedValue({});

    renderPanel();

    fireEvent.click(screen.getByTestId("board-milestone-status-m-1-completed"));

    expect(mocks.update).toHaveBeenCalledWith({
      boardId: "board-1",
      id: "m-1",
      status: "completed",
    });
  });

  it("saves board name and description changes", () => {
    mocks.updateBoard.mockResolvedValue({});

    renderPanel();

    fireEvent.change(screen.getByTestId("board-properties-name-input"), {
      target: { value: "Roadmap 2" },
    });
    fireEvent.click(screen.getByTestId("board-properties-save"));

    expect(mocks.updateBoard).toHaveBeenCalledWith(
      expect.objectContaining({ id: "board-1", name: "Roadmap 2" }),
    );
  });
});
