import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => Promise<void>>(),
  create: vi.fn(),
}));
vi.mock("../../../apps/api/src/events", () => ({
  subscribeToEvent: (
    name: string,
    handler: (data: unknown) => Promise<void>,
  ) => {
    state.handlers.set(name, handler);
  },
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: { userTable: { findFirst: async () => ({ name: "Raisal" }) } },
  },
}));
vi.mock(
  "../../../apps/api/src/notification/controllers/create-notification",
  () => ({ default: state.create }),
);
vi.mock(
  "../../../apps/api/src/notification/task-notification-recipients",
  () => ({
    getTaskNotificationContext: async () => ({
      title: "Ticket",
      number: 386,
      boardId: "board",
      organizationId: "org",
    }),
    getTaskNotificationRecipientIds: async () => ["recipient"],
    getAssignmentNotificationRecipientIds: () => ["recipient"],
  }),
);

import "../../../apps/api/src/notification";

it("stamps the actor on participant and assignment notifications", async () => {
  for (const type of ["task.status_changed", "task.assignee_changed"]) {
    state.create.mockClear();
    const handler = state.handlers.get(type);
    if (!handler) throw new Error(`Missing subscriber ${type}`);
    await handler({
      taskId: "ticket",
      userId: "actor",
      oldStatus: "to-do",
      newStatus: "done",
      newAssigneeId: "recipient",
    });
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventData: expect.objectContaining({ actorName: "Raisal" }),
      }),
    );
  }
});
