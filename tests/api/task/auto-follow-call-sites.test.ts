import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureTaskFollowers = vi.fn(async () => {});
const createNotification = vi.fn(async () => {});
const publishEvent = vi.fn(async () => {});

vi.mock("../../../apps/api/src/task/controllers/ensure-task-followers", () => ({
  default: ensureTaskFollowers,
}));
vi.mock(
  "../../../apps/api/src/notification/controllers/create-notification",
  () => ({ default: createNotification }),
);
vi.mock("../../../apps/api/src/events", () => ({ publishEvent }));

/**
 * Drive the small mention helper through its real exported function. The other
 * mutation controllers have broad DB/repo side effects and are covered by the
 * full API integration pass; this test pins the fragile mentioned-only path
 * that previously got one notification and then disappeared from the thread.
 */
describe("automatic follow call sites (KFL-363)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("turns each newly mentioned description user into a durable follower", async () => {
    const { notifyDescriptionMentions } = await import(
      "../../../apps/api/src/task/controllers/notify-description-mentions"
    );

    await notifyDescriptionMentions({
      description:
        '<kaneo-mention id="user-a" label="Ada"></kaneo-mention>' +
        '<kaneo-mention id="author" label="Author"></kaneo-mention>',
      actorId: "author",
      taskId: "task-1",
      taskTitle: "Ticket",
    });

    expect(ensureTaskFollowers).toHaveBeenCalledWith({
      taskId: "task-1",
      userIds: ["user-a"],
    });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a", type: "task_mention" }),
    );
  });
});
