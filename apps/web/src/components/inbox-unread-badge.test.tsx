import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseGetUnreadNotificationCount = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && typeof options.count === "number"
        ? `${key}:${options.count}`
        : key,
  }),
}));

vi.mock(
  "@/hooks/queries/notification/use-get-unread-notification-count",
  () => ({
    default: () => mockUseGetUnreadNotificationCount(),
  }),
);

import InboxUnreadBadge from "@/components/inbox-unread-badge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withUnreadCount(count: number | undefined) {
  mockUseGetUnreadNotificationCount.mockReturnValue({
    data: count === undefined ? undefined : { count },
  });
}

describe("InboxUnreadBadge", () => {
  it("renders the complete server-side unread count", () => {
    withUnreadCount(73);
    render(<InboxUnreadBadge />);
    expect(screen.getByTestId("inbox-unread-badge").textContent).toBe("73");
  });

  it("renders nothing when every notification is read", () => {
    withUnreadCount(0);
    const { container } = render(<InboxUnreadBadge />);
    expect(screen.queryByTestId("inbox-unread-badge")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while the unread count is loading", () => {
    withUnreadCount(undefined);
    render(<InboxUnreadBadge />);
    expect(screen.queryByTestId("inbox-unread-badge")).toBeNull();
  });

  it("caps a count larger than the 50-row inbox list at 99+", () => {
    withUnreadCount(120);
    render(<InboxUnreadBadge />);
    expect(screen.getByTestId("inbox-unread-badge").textContent).toBe("99+");
  });
});
