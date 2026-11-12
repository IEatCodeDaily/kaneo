import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGithubApp: vi.fn(),
  verifyAndReceive: vi.fn(),
  syncGitHubWebhookPayload: vi.fn(),
}));

vi.mock("./utils/github-app", () => ({
  getGithubApp: mocks.getGithubApp,
}));
vi.mock("../../repo/services/webhook-sync", () => ({
  syncGitHubWebhookPayload: mocks.syncGitHubWebhookPayload,
  syncGiteaWebhookPayload: vi.fn(),
}));
vi.mock("../../database", () => ({ default: { query: {} } }));

import { handleGitHubWebhook } from "./webhook-handler";

function payload(repo = "ucollect-backend-go"): string {
  return JSON.stringify({
    action: "opened",
    repository: { name: repo, owner: { login: "noovoleum" } },
  });
}

describe("handleGitHubWebhook mirror gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGithubApp.mockReturnValue({
      webhooks: { verifyAndReceive: mocks.verifyAndReceive },
    });
    mocks.verifyAndReceive.mockResolvedValue(undefined);
    mocks.syncGitHubWebhookPayload.mockResolvedValue(true);
  });

  it("a CI-storm event is verified but never triggers a mirror sync", async () => {
    const result = await handleGitHubWebhook(
      payload(),
      "sha256=abc",
      "workflow_job",
      "delivery-1",
    );

    expect(result).toEqual({ success: true });
    expect(mocks.verifyAndReceive).toHaveBeenCalledTimes(1);
    expect(mocks.syncGitHubWebhookPayload).not.toHaveBeenCalled();
  });

  it("an issues event still mirrors the repo", async () => {
    const result = await handleGitHubWebhook(
      payload("kaneo"),
      "sha256=abc",
      "issues",
      "delivery-2",
    );

    expect(result).toEqual({ success: true });
    expect(mocks.syncGitHubWebhookPayload).toHaveBeenCalledTimes(1);
    expect(mocks.syncGitHubWebhookPayload).toHaveBeenCalledWith(
      JSON.parse(payload("kaneo")),
    );
  });

  it("a failed mirror does not fail the webhook response", async () => {
    mocks.syncGitHubWebhookPayload.mockRejectedValue(
      new Error("mirror exploded"),
    );
    const result = await handleGitHubWebhook(
      payload("kaneo"),
      "sha256=abc",
      "pull_request",
      "delivery-3",
    );

    expect(result).toEqual({ success: true });
    expect(mocks.syncGitHubWebhookPayload).toHaveBeenCalledTimes(1);
  });
});
