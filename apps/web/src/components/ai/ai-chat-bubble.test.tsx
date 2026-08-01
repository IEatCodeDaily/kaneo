import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiChatBubble } from "./ai-chat-bubble";

// This suite does not auto-cleanup between cases, so a bubble rendered by an
// earlier case leaks into the next one and makes absence assertions lie.
afterEach(cleanup);

let activeOrganization: { id: string; name: string } | undefined = {
  id: "org-1",
  name: "Acme",
};

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: activeOrganization }),
}));

vi.mock("@/fetchers/get-api-url", () => ({
  getApiUrl: (path: string) => `http://api.test${path}`,
}));

type AiSettings = {
  enabled: boolean;
  configured: boolean;
  effectiveTokenLimit: number;
  effectiveCharacterLimit: number;
};

const settingsFor = (enabled: boolean): AiSettings => ({
  enabled,
  configured: true,
  effectiveTokenLimit: 1000,
  effectiveCharacterLimit: 500,
});

function mockSettingsResponse(body: AiSettings | null, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

const BUBBLE_LABEL = "Open organization AI assistant";

function renderBubble() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AiChatBubble />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("AiChatBubble AI-disabled gating", () => {
  beforeEach(() => {
    activeOrganization = { id: "org-1", name: "Acme" };
    vi.unstubAllGlobals();
  });

  it("renders the floating bubble when AI is enabled and configured", async () => {
    mockSettingsResponse(settingsFor(true));
    renderBubble();

    await waitFor(() =>
      expect(screen.getByLabelText(BUBBLE_LABEL)).toBeTruthy(),
    );
  });

  it("does not render the floating bubble when AI is disabled", async () => {
    mockSettingsResponse(settingsFor(false));
    renderBubble();

    // Wait for the settings fetch so this is a real absence rather than the
    // trivially-empty pre-fetch render.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText(BUBBLE_LABEL)).toBeNull(),
    );
  });

  it("hides the bubble immediately when switching to an organization whose AI settings have not loaded", async () => {
    mockSettingsResponse(settingsFor(true));
    const { queryClient, rerender } = renderBubble();
    await waitFor(() =>
      expect(screen.getByLabelText(BUBBLE_LABEL)).toBeTruthy(),
    );

    // The new organization's settings never resolve. The previous
    // organization's `enabled: true` payload must not keep the bubble on
    // screen while we do not know whether AI is enabled here.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    activeOrganization = { id: "org-2", name: "Globex" };
    rerender(
      <QueryClientProvider client={queryClient}>
        <AiChatBubble />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByLabelText(BUBBLE_LABEL)).toBeNull(),
    );
  });
});
