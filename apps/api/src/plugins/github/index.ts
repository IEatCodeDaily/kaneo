import { setupWebhookHandlers } from "./webhook-handler";

// GitHub is a first-class Repo provider, not a board/task integration.
// Task-event handlers deliberately do not exist here.
export function initializeGitHubPlugin() {
  setupWebhookHandlers();
}
