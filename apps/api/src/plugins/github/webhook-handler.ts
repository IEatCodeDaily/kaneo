import { syncGitHubWebhookPayload } from "../../repo/services/webhook-sync";
import { getGithubApp } from "./utils/github-app";

/**
 * GitHub webhook ingress for first-class Repos.
 *
 * A delivery only refreshes the matching Repo mirror. It intentionally has no
 * imports from the old task/board event handlers: provider issues and PRs are
 * not Kaneo tasks.
 */
export async function handleGitHubWebhook(
  body: string,
  signature: string,
  eventName: string,
  deliveryId: string,
): Promise<{ success: boolean; error?: string }> {
  const githubApp = getGithubApp();
  if (!githubApp) {
    return { success: false, error: "GitHub integration not configured" };
  }

  try {
    await githubApp.webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName as
        | "issues"
        | "pull_request"
        | "push"
        | "label"
        | "issue_comment",
      signature,
      payload: body,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Webhook verification failed",
    };
  }
}

export function setupWebhookHandlers() {
  const githubApp = getGithubApp();
  if (!githubApp) return;

  // One provider-level mirror refresh covers issue, PR, label, comment and
  // push events. It is idempotent (upsert by repo+number) and never touches a
  // task, board, column or external_link.
  githubApp.webhooks.onAny(async ({ payload }) => {
    const synced = await syncGitHubWebhookPayload(payload);
    if (synced) console.log("[GitHub Webhook] repo mirror refreshed");
  });
}
