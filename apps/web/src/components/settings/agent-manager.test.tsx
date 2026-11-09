import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentManager } from "./agent-manager";

afterEach(() => {
  cleanup();
  createMutate.mockClear();
  deleteMutate.mockClear();
  reissueMutate.mockClear();
  agents.length = 0;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createMutate = vi.fn(
  async (_input: {
    organizationId: string;
    name: string;
    permissions: Record<string, string[]>;
  }) => ({ key: "kaneo_agent_secret" }),
);
const deleteMutate = vi.fn(async () => undefined);
const reissueMutate = vi.fn(async (_id: string) => ({
  key: "kaneo_agent_rotated",
}));
const agents: Array<{
  id: string;
  name: string;
  createdAt: string;
  token: { id: string; start: string | null; createdAt: string } | null;
}> = [];

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

vi.mock("@/hooks/mutations/agent/use-reissue-agent-token", () => ({
  default: () => ({ mutateAsync: reissueMutate, isPending: false }),
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

  it("creates a non-expiring agent: no expiry is sent", async () => {
    render(<AgentManager />);

    fireEvent.change(nameInput(), { target: { value: "Release bot" } });
    fireEvent.click(createButton());
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));

    const payload = createMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe("Release bot");
    expect(payload.organizationId).toBe("org-1");
    expect(payload).not.toHaveProperty("expiresAt");
  });

  it("reissues an existing agent's token and reveals the new secret once", async () => {
    agents.push({
      id: "agent-1",
      name: "Release bot",
      createdAt: new Date().toISOString(),
      token: {
        id: "k1",
        start: "kaneo_agent_abcd",
        createdAt: new Date().toISOString(),
      },
    });
    render(<AgentManager />);

    fireEvent.click(
      screen.getByRole("button", { name: /team:agentManager.reissue/ }),
    );
    await vi.waitFor(() =>
      expect(reissueMutate).toHaveBeenCalledWith("agent-1"),
    );
    await screen.findByText("kaneo_agent_rotated");
  });

  it("offers to issue a token for an agent whose token was removed", () => {
    agents.push({
      id: "agent-2",
      name: "Idle bot",
      createdAt: new Date().toISOString(),
      token: null,
    });
    render(<AgentManager />);

    expect(screen.getByText("team:agentManager.noToken")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /team:agentManager.issue/ }),
    ).toBeInTheDocument();
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
      createdAt: new Date().toISOString(),
      token: {
        id: "k1",
        start: "kaneo_agent_abcd",
        createdAt: new Date().toISOString(),
      },
    });
    render(<AgentManager />);

    expect(screen.getByText("team:agentManager.title")).toBeInTheDocument();
    expect(
      screen.getByText("team:agentManager.description"),
    ).toBeInTheDocument();
    expect(screen.getByText("team:agentManager.tokenHint")).toBeInTheDocument();
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
