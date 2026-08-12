import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import type Task from "@/types/task";
import TaskStatusPopover from "./task-status-popover";

const useGetColumns = vi.fn();
const updateTaskStatus = vi.fn();
const setTaskArchived = vi.fn();

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: (boardId: string) => useGetColumns(boardId),
}));

vi.mock("@/hooks/mutations/task/use-update-task-status", () => ({
  useUpdateTaskStatus: () => ({ mutateAsync: updateTaskStatus }),
}));

vi.mock("@/hooks/mutations/task/use-set-task-archived", () => ({
  useSetTaskArchived: () => ({ mutateAsync: setTaskArchived }),
}));

vi.mock("@/hooks/use-numbered-shortcuts", () => ({
  useNumberedShortcuts: vi.fn(),
}));

vi.mock("@/hooks/use-organization-permission", () => ({
  useOrganizationPermission: () => ({ canManageTasks: () => true }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const task: Task = {
  id: "task-1",
  title: "Directly loaded task",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  boardId: "board-1",
};

describe("TaskStatusPopover", () => {
  it("uses the same dropdown in controlled create mode without updating a task", async () => {
    useGetColumns.mockReturnValue({
      data: [
        {
          id: "column-1",
          slug: "to-do",
          name: "Ready",
          icon: null,
          isFinal: false,
        },
      ],
      isLoading: false,
      isError: false,
    });
    const onChange = vi.fn();
    updateTaskStatus.mockClear();

    render(
      <TaskStatusPopover boardId="board-1" value="to-do" onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId("task-status-trigger"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: /tasks:actions.moveToBacklog/,
      }),
    );

    expect(useGetColumns).toHaveBeenCalledWith("board-1");
    expect(onChange).toHaveBeenCalledWith("planned");
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it("shows a faint circle when controlled create mode has no status", () => {
    useGetColumns.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<TaskStatusPopover boardId="board-1" onChange={vi.fn()} />);

    expect(
      screen.getByTestId("task-status-trigger").querySelector("svg"),
    ).toHaveClass("text-muted-foreground/60");
    expect(screen.getByTestId("task-status-trigger")).toHaveTextContent(
      "tasks:status.label",
    );
  });

  it("loads status options for the task board without relying on board state", async () => {
    useGetColumns.mockReturnValue({
      data: [
        {
          id: "column-1",
          slug: "to-do",
          name: "Ready",
          icon: null,
          isFinal: false,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(
      <TaskStatusPopover task={task}>
        <Button>Status</Button>
      </TaskStatusPopover>,
    );

    expect(useGetColumns).toHaveBeenCalledWith("board-1");
    expect(screen.queryByRole("button", { name: /Ready/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(await screen.findByRole("button", { name: /Ready/ })).toBeVisible();
  });

  it("shows loading feedback while status options are loading", async () => {
    useGetColumns.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <TaskStatusPopover task={task}>
        <Button>Status</Button>
      </TaskStatusPopover>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(await screen.findByText("common:empty.loading")).toBeVisible();
  });

  it("shows error feedback when status options fail to load", async () => {
    useGetColumns.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <TaskStatusPopover task={task}>
        <Button>Status</Button>
      </TaskStatusPopover>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Status" }));

    expect(await screen.findByText("common:error.title")).toBeVisible();
  });

  describe("backlog and archive actions", () => {
    const columns = [
      {
        id: "column-1",
        slug: "to-do",
        name: "Ready",
        icon: null,
        isFinal: false,
      },
    ];

    it("offers them below a divider, separated from the board columns", async () => {
      useGetColumns.mockReturnValue({
        data: columns,
        isLoading: false,
        isError: false,
      });

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Status" }));

      const backlog = await screen.findByRole("button", {
        name: /tasks:actions.moveToBacklog/,
      });
      const archive = screen.getByRole("button", {
        name: /tasks:actions.archive/,
      });
      const divider = screen.getByTestId("status-divider");
      const column = screen.getByRole("button", { name: /Ready/ });

      // Order matters: statuses, then the divider, then the two explicit
      // actions. Presence alone would not catch them being mixed in.
      expect(
        column.compareDocumentPosition(divider) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        divider.compareDocumentPosition(backlog) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        backlog.compareDocumentPosition(archive) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("moves the task to the planned status the Backlog view reads", async () => {
      useGetColumns.mockReturnValue({
        data: columns,
        isLoading: false,
        isError: false,
      });
      updateTaskStatus.mockClear();

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Status" }));
      fireEvent.click(
        await screen.findByRole("button", {
          name: /tasks:actions.moveToBacklog/,
        }),
      );

      expect(updateTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", status: "planned" }),
      );
    });

    it("archives via archived_at and never as a status", async () => {
      useGetColumns.mockReturnValue({
        data: columns,
        isLoading: false,
        isError: false,
      });
      updateTaskStatus.mockClear();
      setTaskArchived.mockClear();
      setTaskArchived.mockResolvedValue({});

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Status" }));
      fireEvent.click(
        await screen.findByRole("button", { name: /tasks:actions.archive/ }),
      );

      /*
        #226: archival is orthogonal to status. This test previously asserted
        `status: "archived"`, which is exactly the defect — migration 0062 dropped
        "archived" from the vocabulary, so that call 400s with
        `Invalid status "archived"`.
      */
      expect(setTaskArchived).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1", archived: true }),
      );
      expect(updateTaskStatus).not.toHaveBeenCalled();
      expect(JSON.stringify(setTaskArchived.mock.calls)).not.toContain(
        '"archived":"archived"',
      );
    });

    it("offers unarchive for an already archived task", async () => {
      useGetColumns.mockReturnValue({
        data: columns,
        isLoading: false,
        isError: false,
      });
      setTaskArchived.mockClear();
      setTaskArchived.mockResolvedValue({});

      render(
        <TaskStatusPopover
          task={{ ...task, archivedAt: "2026-08-05T00:00:00.000Z" }}
        >
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Status" }));
      fireEvent.click(
        await screen.findByRole("button", { name: /tasks:actions.unarchive/ }),
      );

      expect(setTaskArchived).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1", archived: false }),
      );
    });

    it("keeps the archive action out of the status option list", async () => {
      useGetColumns.mockReturnValue({
        data: columns,
        isLoading: false,
        isError: false,
      });

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Status" }));

      // archive is an action, not a selectable status: it must not be rendered
      // as one of the status buttons the shortcut list indexes
      const archive = await screen.findByTestId("task-archive-action");
      expect(archive).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /tasks:status.archived/ }),
      ).toBeNull();
    });
  });
});
