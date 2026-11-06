import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  value: { isRead: true } as Record<string, unknown>,
  rows: [{ id: "n1" }] as unknown[],
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.value = value;
        return { where: () => ({ returning: async () => state.rows }) };
      },
    }),
  },
}));

import markAsRead from "../../../apps/api/src/notification/controllers/mark-notification-as-read";

describe("notification read state", () => {
  beforeEach(() => {
    state.rows = [{ id: "n1" }];
  });
  it("supports marking an owned notification unread", async () => {
    await markAsRead("n1", "user1", false);
    expect(state.value.isRead).toBe(false);
  });
  it("refuses a notification outside the caller predicate", async () => {
    state.rows = [];
    await expect(markAsRead("foreign", "user1", false)).rejects.toThrow(
      "Notification not found",
    );
  });
});
