import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseGetNotifications = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && typeof options.count === "number"
        ? `${key}:${options.count}`
        : key,
  }),
}));

vi.mock("@/hooks/queries/notification/use-get-notifications", () => ({
  default: () => mockUseGetNotifications(),
}));

import InboxUnreadBadge from "@/components/inbox-unread-badge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Row = { id: string; isRead: boolean };

function withNotifications(rows: Row[] | undefined) {
  mockUseGetNotifications.mockReturnValue({ data: rows });
}

describe("InboxUnreadBadge", () => {
  it("renders the number of unread notifications, not the total row count", () => {
    withNotifications([
      { id: "a", isRead: false },
      { id: "b", isRead: true },
      { id: "c", isRead: false },
      { id: "d", isRead: true },
      { id: "e", isRead: true },
    ]);

    render(<InboxUnreadBadge />);

    const badge = screen.getByTestId("inbox-unread-badge");
    expect(badge.textContent).toBe("2");
  });

  it("renders nothing when every notification is read (no zero badge)", () => {
    withNotifications([
      { id: "a", isRead: true },
      { id: "b", isRead: true },
    ]);

    const { container } = render(<InboxUnreadBadge />);

    expect(screen.queryByTestId("inbox-unread-badge")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders nothing while notifications are still loading", () => {
    withNotifications(undefined);

    render(<InboxUnreadBadge />);

    expect(screen.queryByTestId("inbox-unread-badge")).toBeNull();
  });

  it("caps the displayed count at 99+", () => {
    withNotifications(
      Array.from({ length: 120 }, (_, index) => ({
        id: String(index),
        isRead: false,
      })),
    );

    render(<InboxUnreadBadge />);

    expect(screen.getByTestId("inbox-unread-badge").textContent).toBe("99+");
  });
});
