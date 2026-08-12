import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_KEY_LIFETIME_DAYS, AgentManager } from "./agent-manager";

afterEach(() => {
  cleanup();
  createMutate.mockClear();
  deleteMutate.mockClear();
  agents.length = 0;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createMutate = vi.fn(
  async (_input: {
    organizationId: string;
    name: string;
    expiresAt: string;
    permissions: Record<string, string[]>;
  }) => ({ key: "kaneo_agent_secret" }),
);
const deleteMutate = vi.fn(async () => undefined);
const agents: Array<{ id: string; name: string; expiresAt: string }> = [];

vi.mock("@/hooks/queries/organization/use-active-organization", () => ({
  default: () => ({ data: { id: "org-1" } }),
}));

vi.mock("@/hooks/queries/agent/use-get-agents", () => ({
  default: () => ({ data: agents }),
}));

vi.mock("@/hooks/mutations/agent/use-create-agent", () => ({
  default: () => ({ mutateAsync: createMutate, isPending: false }),
}));

vi.mock("@/hooks/mutations/agent/use-delete-agent", () => ({
  default: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function nameInput() {
  return screen.getByLabelText("team:agentManager.nameLabel");
}

function createButton() {
  return screen.getByRole("button", { name: /team:agentManager.create/ });
}

describe("AgentManager", () => {
  it("registers an agent without asking the operator to pick an expiry date", () => {
    render(<AgentManager />);

    // The date picker was the whole complaint: creating an agent must not
    // require choosing a timestamp.
    expect(document.querySelector("input[type='datetime-local']")).toBeNull();
    expect(document.querySelector("input[type='date']")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("submits a server-valid expiry the user never had to enter", async () => {
    render(<AgentManager />);

    fireEvent.change(nameInput(), { target: { value: "Release bot" } });
    fireEvent.click(createButton());
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));

    const payload = createMutate.mock.calls[0][0] as unknown as {
      name: string;
      expiresAt: string;
      organizationId: string;
    };
    expect(payload.name).toBe("Release bot");
    expect(payload.organizationId).toBe("org-1");

    // The API rejects an expiry in the past or beyond 365 days.
    const expiry = new Date(payload.expiresAt).getTime();
    expect(Number.isNaN(expiry)).toBe(false);
    expect(expiry).toBeGreaterThan(Date.now());
    expect(expiry).toBeLessThanOrEqual(Date.now() + 365 * 86400000);
    expect(AGENT_KEY_LIFETIME_DAYS).toBeLessThanOrEqual(365);
  });

  it("keeps create disabled until the name meets the API minimum length", () => {
    render(<AgentManager />);

    expect(createButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "ab" } });
    expect(createButton()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "abc" } });
    expect(createButton()).toBeEnabled();

    // Whitespace-only names would 400 on the server.
    fireEvent.change(nameInput(), { target: { value: "   " } });
    expect(createButton()).toBeDisabled();
  });

  it("labels the name field instead of relying on a bare placeholder", () => {
    render(<AgentManager />);

    const label = screen.getByText("team:agentManager.nameLabel");
    expect(label.tagName).toBe("LABEL");
    expect(label.getAttribute("for")).toBe(nameInput().getAttribute("id"));
  });

  it("renders translated section copy, never a raw i18n fallback", () => {
    agents.push({
      id: "a1",
      name: "Release bot",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    render(<AgentManager />);

    expect(screen.getByText("team:agentManager.title")).toBeInTheDocument();
    expect(
      screen.getByText("team:agentManager.description"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("team:agentManager.expiryHint"),
    ).toBeInTheDocument();
    // Dot-separated keys are the bug signature: they never resolve because the
    // default namespace is `common`, so the raw key renders on screen.
    expect(screen.queryByText(/team\.agentManager/)).toBeNull();
    expect(screen.queryByText(/team\.members/)).toBeNull();
  });

  it("reveals the secret once after creation", async () => {
    render(<AgentManager />);

    expect(screen.queryByText("kaneo_agent_secret")).toBeNull();

    fireEvent.change(nameInput(), { target: { value: "Release bot" } });
    fireEvent.click(createButton());

    await screen.findByText("kaneo_agent_secret");
    expect(
      screen.getByText("team:agentManager.secretWarning"),
    ).toBeInTheDocument();
    // Name resets so the form is ready for the next agent.
    expect(nameInput()).toHaveValue("");
  });
});
