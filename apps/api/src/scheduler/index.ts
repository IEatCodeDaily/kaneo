import { Cron } from "croner";
import { checkBoardWebhookReminders } from "./board-webhook-reminders";
import { checkDueDateReminders } from "./due-date-reminders";
import { purgeExpiredTrashedTasks } from "./purge-trashed-tasks";
import { syncStaleRepos } from "./sync-stale-repos";

const jobs: Cron[] = [];

/**
 * A job that throws (e.g. a database connection timeout) must log and wait for
 * its next tick. Without `catch`, croner rethrows from its timer and the
 * unhandled rejection terminates the whole API process.
 */
export function logJobFailure(error: unknown, job: Cron): void {
  console.error(`[Scheduler] ${job.name ?? "job"} failed`, error);
}

export function scheduleJob(
  pattern: string,
  name: string,
  run: () => Promise<void>,
): Cron {
  const job = new Cron(pattern, { name, catch: logJobFailure }, run);
  jobs.push(job);
  return job;
}

export function initializeScheduler(): void {
  scheduleJob("*/5 * * * *", "due-date-reminders", checkDueDateReminders);
  scheduleJob(
    "*/5 * * * *",
    "board-webhook-reminders",
    checkBoardWebhookReminders,
  );
  scheduleJob("*/15 * * * *", "stale-repo-resync", syncStaleRepos);
  scheduleJob("0 * * * *", "trash-purge", purgeExpiredTrashedTasks);
  console.log(
    "⏰ Scheduler started (due date + board webhook reminders every 5m, stale repo resync every 15m, trash purge hourly)",
  );
}

export function shutdownScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
