import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/components/task/task-details-sheet", () => ({
  default: () => null,
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
    mocks.deleteNotifications.mockReset();
    mocks.clearAll.mockReset();
    mocks.notifications = [];
  });

  it("renders a dismiss control per notification and deletes only that one", () => {
    mocks.notifications = [
      notification("n-1", "board-1", "task-1"),
      notification("n-2", "board-1", "task-1"),
    ];
    render(<InboxComponent />);

    const dismissButtons = screen.getAllByRole("button", {
      name: "inbox:dismiss",
    });
    expect(dismissButtons).toHaveLength(2);

    fireEvent.click(dismissButtons[1]);

    expect(mocks.deleteNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNotifications).toHaveBeenCalledWith(["n-2"]);
    expect(mocks.clearAll).not.toHaveBeenCalled();
  });

  it("renders a clear control per board group and deletes every id in it", () => {
    mocks.notifications = [
      notification("n-1", "board-1", "task-1"),
      notification("n-2", "board-1", "task-2"),
      notification("n-3", "board-2", "task-3"),
    ];
    render(<InboxComponent />);

    const groupButtons = screen.getAllByRole("button", {
      name: "inbox:clearGroup",
    });
    expect(groupButtons).toHaveLength(2);

    fireEvent.click(groupButtons[0]);

    expect(mocks.deleteNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNotifications).toHaveBeenCalledWith(["n-1", "n-2"]);
    expect(mocks.clearAll).not.toHaveBeenCalled();
  });

  it("clearing a group does not toggle the group's collapse state", () => {
    mocks.notifications = [notification("n-1", "board-1", "task-1")];
    render(<InboxComponent />);

    const toggle = screen.getByRole("button", { name: /Board board-1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "inbox:clearGroup" }));

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("dismissing does not mark the notification as read or navigate", () => {
    mocks.notifications = [notification("n-1", "board-1", "task-1")];
    render(<InboxComponent />);

    fireEvent.click(screen.getByRole("button", { name: "inbox:dismiss" }));

    expect(mocks.markAsRead).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
