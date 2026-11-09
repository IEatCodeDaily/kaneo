import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxComponent } from "./inbox";

const mocks = vi.hoisted(() => ({
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  clearAll: vi.fn(),
  deleteNotifications: vi.fn(),
  navigate: vi.fn(),
  notifications: [] as unknown[],
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0
        ? `${key}:${JSON.stringify(options)}`
        : key,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useParams: () => ({ organizationSlug: "acme" }),
    useSearch: () => ({}),
  }),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/components/common/organization-layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/page-title", () => ({ default: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/task/task-details-content", () => ({
  default: () => (
    <div data-testid="preview-content">
      <div className="kaneo-comment-editor-content">
        <div contentEditable suppressContentEditableWarning>
          Reply
        </div>
      </div>
    </div>
  ),
}));
vi.mock(
  "@/hooks/mutations/notification/use-mark-notification-as-unread",
  () => ({ default: () => ({ mutate: vi.fn() }) }),
);
vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
  TaskDetailsPanel: () => (
    <div data-testid="preview-content">
      <div data-testid="preview-properties">Properties</div>
      <div className="kaneo-comment-editor-content">
        <div contentEditable suppressContentEditableWarning>
          Reply
        </div>
      </div>
    </div>
  ),
}));
vi.mock("@/components/notification/notification-dropdown", () => ({
  getNotificationTitle: (n: { title?: string }) => n.title ?? "untitled",
  getNotificationContent: () => "",
}));

vi.mock("@/hooks/queries/notification/use-get-notifications", () => ({
  default: () => ({ data: mocks.notifications, isLoading: false }),
}));
vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));
vi.mock("@/hooks/mutations/notification/use-mark-notification-as-read", () => ({
  default: () => ({ mutate: mocks.markAsRead }),
}));
vi.mock(
  "@/hooks/mutations/notification/use-mark-all-notifications-as-read",
  () => ({ default: () => ({ mutate: mocks.markAllAsRead }) }),
);
vi.mock("@/hooks/mutations/notification/use-clear-notifications", () => ({
  default: () => ({ mutate: mocks.clearAll }),
}));
vi.mock("@/hooks/mutations/notification/use-delete-notification", () => ({
  default: () => ({ mutate: mocks.deleteNotifications }),
}));

function notification(id: string, boardId: string, taskId: string) {
  return {
    id,
    userId: "user-1",
    title: `Event ${id}`,
    content: "",
    type: "task_updated",
    resourceType: "task",
    resourceId: taskId,
    isRead: true,
    createdAt: new Date("2026-08-01T10:00:00.000Z").toISOString(),
    eventData: {
      boardId,
      boardName: `Board ${boardId}`,
      taskTitle: `Task ${taskId}`,
    },
  };
}

describe("InboxComponent granular clearing", () => {
  afterEach(() => {
    cleanup();
    mocks.markAsRead.mockReset();
    mocks.navigate.mockReset();
    mocks.deleteNotifications.mockReset();
    mocks.clearAll.mockReset();
    mocks.notifications = [];
  });

  it("lets the inbox fieldset shrink below its native min-content width", () => {
    render(<InboxComponent />);
    expect(
      screen.getByRole("group", { name: "inbox:title" }).className.split(/\s+/),
    ).toContain("min-w-0");
  });
  it("keeps filter controls at least 44px wide on mobile", () => {
    render(<InboxComponent />);
    expect(
      screen
        .getByRole("button", { name: "inbox:filter.all" })
        .className.split(" "),
    ).toContain("min-w-11");
  });
  it("focuses the reused comment composer with R from a selected row", async () => {
    mocks.notifications = [notification("reply", "board-1", "task-1")];
    render(<InboxComponent />);
    const row = screen.getByRole("button", { name: "Task task-1" });
    fireEvent.click(row);
    await screen.findByTestId("preview-content");
    row.focus();
    fireEvent.keyDown(row, { key: "r" });
    await waitFor(() => expect(screen.getByText("Reply")).toHaveFocus());
  });
  it("keeps the selection-time unread count after read-on-open refetch", async () => {
    mocks.notifications = [
      { ...notification("new", "board-1", "task-1"), isRead: false },
    ];
    const { rerender } = render(<InboxComponent />);
    fireEvent.click(screen.getByRole("button", { name: "Task task-1" }));
    await screen.findByTestId("preview-content");
    expect(
      screen.getByText('inbox:newSinceRead:{"count":1}'),
    ).toBeInTheDocument();
    mocks.notifications = [notification("new", "board-1", "task-1")];
    rerender(<InboxComponent />);
    expect(
      screen.getByText('inbox:newSinceRead:{"count":1}'),
    ).toBeInTheDocument();
  });
  it("previews the ticket with the drawer panel instead of an Open ticket button", async () => {
    mocks.notifications = [
      {
        ...notification("flag", "board-1", "task-1"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(screen.getByRole("button", { name: "Task task-1" }));
    await screen.findByTestId("preview-content");
    expect(screen.getByTestId("preview-properties")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "inbox:openTask" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "inbox:openToResolveFlag" }),
    ).not.toBeInTheDocument();
  });
  it("shows the supplied actor beside the event", () => {
    const update = notification("actor", "board-1", "task-1");
    mocks.notifications = [
      {
        ...update,
        eventData: { ...update.eventData, actorName: "Engineering Lead" },
      },
    ];
    render(<InboxComponent />);
    expect(screen.getByText("Engineering Lead")).toBeInTheDocument();
  });
  it("shows a clock time for today's updates", () => {
    const createdAt = new Date().toISOString();
    mocks.notifications = [
      { ...notification("today", "board-1", "task-1"), createdAt },
    ];
    render(<InboxComponent />);
    expect(
      screen.getByText(
        new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(createdAt)),
      ),
    ).toBeInTheDocument();
  });
  it("filters unread and mentions without hiding standing flags", () => {
    mocks.notifications = [
      notification("read", "board-1", "task-1"),
      {
        ...notification("mention", "board-1", "task-2"),
        type: "task_mention",
        isRead: false,
      },
      {
        ...notification("flag", "board-1", "task-3"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(
      screen.getByRole("button", { name: "inbox:filter.unread" }),
    );
    expect(screen.queryByText("Event read")).not.toBeInTheDocument();
    expect(screen.getByText("Event mention")).toBeInTheDocument();
    expect(screen.getByText("Event flag")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "inbox:filter.mentions" }),
    );
    expect(screen.getByText("Event mention")).toBeInTheDocument();
  });

  it("moves focus with arrow keys and never deletes a standing flag", () => {
    mocks.notifications = [
      notification("one", "board-1", "task-1"),
      {
        ...notification("flag", "board-1", "task-2"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    const first = screen.getByText("Event flag").closest("button");
    const second = screen.getByText("Event one").closest("button");
    if (!first || !second) throw new Error("Notification buttons missing");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(first, { key: "Delete" });
    expect(mocks.deleteNotifications).not.toHaveBeenCalled();
  });

  it("marks only displayed non-flagged updates read", () => {
    mocks.markAsRead.mockReset();
    mocks.notifications = [
      { ...notification("unread", "board-1", "task-1"), isRead: false },
      {
        ...notification("flag", "board-1", "task-2"),
        type: "task_flag_raised",
        isRead: false,
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.markAllRead" }),
    );
    expect(mocks.markAsRead).toHaveBeenCalledExactlyOnceWith("unread");
    mocks.markAsRead.mockReset();
  });

  it("offers mouse read/unread triage while locking standing flags", () => {
    mocks.notifications = [
      { ...notification("one", "board-1", "task-1"), isRead: false },
      {
        ...notification("flag", "board-1", "task-2"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(screen.getByRole("button", { name: "inbox:markRead" }));
    expect(mocks.markAsRead).toHaveBeenCalledWith("one");
    expect(
      screen.getByRole("button", { name: "inbox:markUnread" }),
    ).toBeDisabled();
  });

  it("marks a folded ticket read exactly once per unread event", () => {
    mocks.markAsRead.mockReset();
    mocks.notifications = [
      { ...notification("one", "board-1", "task-1"), isRead: false },
      { ...notification("two", "board-1", "task-1"), isRead: false },
    ];
    render(<InboxComponent />);
    fireEvent.click(screen.getByRole("button", { name: "Task task-1" }));
    expect(mocks.markAsRead.mock.calls.map(([id]) => id)).toEqual([
      "one",
      "two",
    ]);
    mocks.markAsRead.mockReset();
    mocks.navigate.mockReset();
  });

  it("clears only read non-flagged notifications", () => {
    mocks.notifications = [
      notification("read", "board-1", "task-1"),
      { ...notification("unread", "board-1", "task-2"), isRead: false },
      {
        ...notification("flag", "board-1", "task-3"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(screen.getByRole("button", { name: "inbox:clearRead" }));
    expect(mocks.deleteNotifications).toHaveBeenCalledWith(["read"]);
  });

  it("clears read updates only from the filtered board", async () => {
    mocks.notifications = [
      notification("shown", "board-1", "task-1"),
      notification("hidden", "board-2", "task-2"),
    ];
    render(<InboxComponent />);
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.filter" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "inbox:filterBoard" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Board board-1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "inbox:clearRead" }));
    expect(mocks.deleteNotifications).toHaveBeenCalledWith(["shown"]);
  });

  it("clear shown under Mentions deletes only displayed mentions, never flags", async () => {
    mocks.notifications = [
      { ...notification("mention", "board-1", "task-1"), type: "task_mention" },
      notification("other", "board-1", "task-2"),
      {
        ...notification("flag", "board-1", "task-3"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    fireEvent.click(
      screen.getByRole("button", { name: "inbox:filter.mentions" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: 'inbox:clearShown:{"count":1}' }),
    );
    const dialog = await screen.findByRole("alertdialog");
    // The dialog's close wrapper and its button share the label; click the
    // inner button.
    fireEvent.click(
      within(dialog)
        .getAllByRole("button", { name: 'inbox:clearShown:{"count":1}' })
        .at(-1) as HTMLElement,
    );
    expect(mocks.deleteNotifications).toHaveBeenCalledExactlyOnceWith([
      "mention",
    ]);
  });

  it("clear read under Unread has nothing to clear", () => {
    mocks.notifications = [
      notification("read", "board-1", "task-1"),
      { ...notification("unread", "board-1", "task-2"), isRead: false },
    ];
    render(<InboxComponent />);
    fireEvent.click(
      screen.getByRole("button", { name: "inbox:filter.unread" }),
    );
    expect(
      screen.getByRole("button", { name: "inbox:clearRead" }),
    ).toBeDisabled();
  });

  it("dismisses every event in a folded ticket row", () => {
    mocks.notifications = [
      notification("n-1", "board-1", "task-1"),
      notification("n-2", "board-1", "task-1"),
    ];
    render(<InboxComponent />);

    const dismissButtons = screen.getAllByRole("button", {
      name: "inbox:dismiss",
    });
    expect(dismissButtons).toHaveLength(1);

    fireEvent.click(dismissButtons[0]);

    expect(mocks.deleteNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNotifications).toHaveBeenCalledWith(["n-1", "n-2"]);
    expect(mocks.clearAll).not.toHaveBeenCalled();
  });

  it("keeps standing flags pinned and blocks row-level triage shortcuts", () => {
    mocks.notifications = [
      notification("comment", "board-1", "task-1"),
      {
        ...notification("flag", "board-1", "task-1"),
        type: "task_flag_raised",
      },
    ];
    render(<InboxComponent />);
    const row = screen.getByRole("button", { name: "Task task-1" });
    fireEvent.keyDown(row, { key: "u" });
    fireEvent.keyDown(row, { key: "e" });
    fireEvent.keyDown(row, { key: "Delete" });
    expect(mocks.deleteNotifications).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "inbox:dismiss" }),
    ).toBeDisabled();
  });

  it("dismissing does not mark the notification as read or navigate", () => {
    mocks.notifications = [notification("n-1", "board-1", "task-1")];
    render(<InboxComponent />);

    fireEvent.click(screen.getByRole("button", { name: "inbox:dismiss" }));

    expect(mocks.markAsRead).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
