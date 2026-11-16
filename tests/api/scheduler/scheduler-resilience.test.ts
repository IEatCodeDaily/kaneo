import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/database", () => ({ default: {} }));
vi.mock("../../../apps/api/src/scheduler/board-webhook-reminders", () => ({
  checkBoardWebhookReminders: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/due-date-reminders", () => ({
  checkDueDateReminders: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/purge-trashed-tasks", () => ({
  purgeExpiredTrashedTasks: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/sync-stale-repos", () => ({
  syncStaleRepos: vi.fn(),
}));

import {
  scheduleJob,
  shutdownScheduler,
} from "../../../apps/api/src/scheduler";

afterEach(() => {
  shutdownScheduler();
  vi.restoreAllMocks();
});

// A database blip inside a scheduled job used to escape croner's timer as an
// unhandled rejection and terminate the API process (kaneo.entelechia outage).
describe("scheduler job failures", () => {
  it("logs a failing job and keeps the process alive", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const job = scheduleJob("0 0 1 1 *", "db-blip", async () => {
        throw new Error("Connection terminated due to connection timeout");
      });
      await job.trigger();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "[Scheduler] db-blip failed",
        expect.objectContaining({ message: expect.stringMatching(/timeout/) }),
      );
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
