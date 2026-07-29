import { Cron } from "croner";
import { checkBoardWebhookReminders } from "./board-webhook-reminders";
import { checkDueDateReminders } from "./due-date-reminders";

const jobs: Cron[] = [];

export function initializeScheduler(): void {
  jobs.push(new Cron("*/5 * * * *", checkDueDateReminders));
  jobs.push(new Cron("*/5 * * * *", checkBoardWebhookReminders));
  console.log(
    "⏰ Scheduler started (due date and board webhook reminders every 5 minutes)",
  );
}

export function shutdownScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
