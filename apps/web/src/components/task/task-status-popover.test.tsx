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

/*
  Every status is a board row. Custom names (not the seeded defaults) render
  verbatim, so assertions key on them without depending on i18n.
*/
const row = (
  slug: string,
  name: string,
  statusType: string,
  position = 0,
  isFinal = false,
) => ({
  id: `col-${slug}`,
  slug,
  name,
  icon: null,
  isFinal,
  statusType,
  position,
});

const BOARD = [
  row("done", "Shipped", "completed", 0, true),
  row("to-do", "Ready", "unstarted"),
  row("planned", "Later", "backlog"),
  row("canceled", "Dropped", "canceled", 0, true),
  row("wont-fix", "Won't fix", "canceled", 1, true),
  row("triage", "Inbox", "triage"),
];

const loaded = (data: unknown) => ({ data, isLoading: false, isError: false });

const openPicker = () =>
  fireEvent.click(screen.getByRole("button", { name: "Status" }));

describe("TaskStatusPopover", () => {
  it("uses the same dropdown in controlled create mode without updating a task", async () => {
    useGetColumns.mockReturnValue(loaded(BOARD));
    const onChange = vi.fn();
    updateTaskStatus.mockClear();

    render(
      <TaskStatusPopover boardId="board-1" value="to-do" onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId("task-status-trigger"));
    fireEvent.click(await screen.findByRole("button", { name: /Later/ }));

    expect(useGetColumns).toHaveBeenCalledWith("board-1");
    expect(onChange).toHaveBeenCalledWith("planned");
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it("shows a faint circle when controlled create mode has no status", () => {
    useGetColumns.mockReturnValue(loaded([]));

    render(<TaskStatusPopover boardId="board-1" onChange={vi.fn()} />);

    expect(
      screen.getByTestId("task-status-trigger").querySelector("svg"),
    ).toHaveClass("text-muted-foreground/60");
    expect(screen.getByTestId("task-status-trigger")).toHaveTextContent(
      "tasks:status.label",
    );
  });

  it("loads status options for the task board without relying on board state", async () => {
    useGetColumns.mockReturnValue(loaded(BOARD));

    render(
      <TaskStatusPopover task={task}>
        <Button>Status</Button>
      </TaskStatusPopover>,
    );

    expect(useGetColumns).toHaveBeenCalledWith("board-1");
    expect(screen.queryByRole("button", { name: /Ready/ })).toBeNull();

    openPicker();

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

    openPicker();

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

    openPicker();

    expect(await screen.findByText("common:error.title")).toBeVisible();
  });

  describe("status model", () => {
    it("lists exactly the board's statuses, grouped Backlog / Active / Closed", async () => {
      useGetColumns.mockReturnValue(loaded(BOARD));

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      openPicker();

      const order = [
        await screen.findByTestId("status-section-backlog"),
        screen.getByRole("button", { name: /Inbox/ }),
        screen.getByRole("button", { name: /Later/ }),
        screen.getByTestId("status-section-active"),
        screen.getByRole("button", { name: /Ready/ }),
        screen.getByTestId("status-section-closed"),
        screen.getByRole("button", { name: /Shipped/ }),
        screen.getByRole("button", { name: /Dropped/ }),
        screen.getByRole("button", { name: /Won't fix/ }),
        screen.getByTestId("archive-divider"),
        screen.getByTestId("task-archive-action"),
      ];
      for (let i = 1; i < order.length; i++) {
        expect(
          order[i - 1].compareDocumentPosition(order[i]) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          `element ${i} out of order`,
        ).toBeTruthy();
      }
      // Nothing hardcoded: a status the board does not have is not offered.
      expect(screen.queryByRole("button", { name: /duplicate/i })).toBeNull();
    });

    it("sets a custom closed status like any other", async () => {
      useGetColumns.mockReturnValue(loaded(BOARD));
      updateTaskStatus.mockClear();

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      openPicker();
      fireEvent.click(await screen.findByRole("button", { name: /Won't fix/ }));

      expect(updateTaskStatus).toHaveBeenCalledWith(
        expect.objectContaining({ id: "task-1", status: "wont-fix" }),
      );
    });

    it("archives via archived_at and never as a status", async () => {
      useGetColumns.mockReturnValue(loaded(BOARD));
      updateTaskStatus.mockClear();
      setTaskArchived.mockClear();
      setTaskArchived.mockResolvedValue({});

      render(
        <TaskStatusPopover task={task}>
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      openPicker();
      fireEvent.click(
        await screen.findByRole("button", { name: /tasks:actions.archive/ }),
      );

      /*
        #226: archival is orthogonal to status — migration 0062 dropped
        "archived" from the vocabulary, so a status write of it 400s.
      */
      expect(setTaskArchived).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1", archived: true }),
      );
      expect(updateTaskStatus).not.toHaveBeenCalled();
    });

    it("offers unarchive for an already archived task", async () => {
      useGetColumns.mockReturnValue(loaded(BOARD));
      setTaskArchived.mockClear();
      setTaskArchived.mockResolvedValue({});

      render(
        <TaskStatusPopover
          task={{ ...task, archivedAt: "2026-08-05T00:00:00.000Z" }}
        >
          <Button>Status</Button>
        </TaskStatusPopover>,
      );
      openPicker();
      fireEvent.click(
        await screen.findByRole("button", { name: /tasks:actions.unarchive/ }),
      );

      expect(setTaskArchived).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1", archived: false }),
      );
    });
  });
});
