import { afterEach, expect, it, vi } from "vitest";
import createDiscord from "./discord-integration/create-discord-integration";
import deleteDiscord from "./discord-integration/delete-discord-integration";
import getDiscord from "./discord-integration/get-discord-integration";
import updateDiscord from "./discord-integration/update-discord-integration";
import createWebhook from "./generic-webhook-integration/create-generic-webhook-integration";
import deleteWebhook from "./generic-webhook-integration/delete-generic-webhook-integration";
import getWebhook from "./generic-webhook-integration/get-generic-webhook-integration";
import updateWebhook from "./generic-webhook-integration/update-generic-webhook-integration";
import createSlack from "./slack-integration/create-slack-integration";
import deleteSlack from "./slack-integration/delete-slack-integration";
import getSlack from "./slack-integration/get-slack-integration";
import updateSlack from "./slack-integration/update-slack-integration";
import createTelegram from "./telegram-integration/create-telegram-integration";
import deleteTelegram from "./telegram-integration/delete-telegram-integration";
import getTelegram from "./telegram-integration/get-telegram-integration";
import updateTelegram from "./telegram-integration/update-telegram-integration";

const id = "board-current";
const webhook = { webhookUrl: "https://example.test/hook" };
const telegram = { botToken: "test-token", chatId: "test-chat" };
const cases: Array<[string, string, () => Promise<unknown>]> = [
  ["discord-integration", "POST", () => createDiscord(id, webhook)],
  ["discord-integration", "GET", () => getDiscord(id)],
  ["discord-integration", "PATCH", () => updateDiscord(id, {})],
  ["discord-integration", "DELETE", () => deleteDiscord(id)],
  ["generic-webhook-integration", "POST", () => createWebhook(id, webhook)],
  ["generic-webhook-integration", "GET", () => getWebhook(id)],
  ["generic-webhook-integration", "PATCH", () => updateWebhook(id, {})],
  ["generic-webhook-integration", "DELETE", () => deleteWebhook(id)],
  ["slack-integration", "POST", () => createSlack(id, webhook)],
  ["slack-integration", "GET", () => getSlack(id)],
  ["slack-integration", "PATCH", () => updateSlack(id, {})],
  ["slack-integration", "DELETE", () => deleteSlack(id)],
  ["telegram-integration", "POST", () => createTelegram(id, telegram)],
  ["telegram-integration", "GET", () => getTelegram(id)],
  ["telegram-integration", "PATCH", () => updateTelegram(id, {})],
  ["telegram-integration", "DELETE", () => deleteTelegram(id)],
];

afterEach(() => vi.unstubAllGlobals());

it.each(cases)(
  "%s %s uses the supplied board ID",
  async (integration, method, call) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await call();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(new URL(url, "https://example.test").pathname).toBe(
      `/api/${integration}/board/${id}`,
    );
    expect(options.credentials).toBe("include");
    expect(options.method ?? "GET").toBe(method);
  },
);
