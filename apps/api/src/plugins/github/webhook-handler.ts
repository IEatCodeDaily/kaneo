import { syncGitHubWebhookPayload } from "../../repo/services/webhook-sync";
import { getGithubApp } from "./utils/github-app";
import { syncGitHubInstallationEvent } from "./utils/sync-installation-event";

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
      // The narrow union here previously omitted "installation", so uninstall
      // deliveries were rejected at the type/runtime boundary and never
      // reached the handlers. Cast to the library's own event-name type.
      name: eventName as Parameters<
        typeof githubApp.webhooks.verifyAndReceive
      >[0]["name"],
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
  githubApp.webhooks.onAny(async ({ name, payload }) => {
    // `installation` deliveries carry no `repository`, so the mirror sync below
    // ignores them. They are the only signal we get that an install was removed
    // or re-scoped, and a stale row breaks every later token request.
    if (await syncGitHubInstallationEvent(name, payload)) {
      console.log("[GitHub Webhook] installation registry refreshed");
      return;
    }

    const synced = await syncGitHubWebhookPayload(payload);
    if (synced) console.log("[GitHub Webhook] repo mirror refreshed");
  });
}
