import { Bot, Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Agent = {
  id: string;
  name: string;
  expiresAt: string;
  permissions: Record<string, string[]>;
};
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:1337";

export function AgentManager() {
  const { data: organization } = useActiveOrganization();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const load = async () => {
    if (!organization?.id) return;
    const response = await fetch(
      `${API_URL}/api/agent?organizationId=${organization.id}`,
      { credentials: "include" },
    );
    if (response.ok) setAgents(await response.json());
  };
  useEffect(() => {
    if (!organization?.id) return;
    void fetch(`${API_URL}/api/agent?organizationId=${organization.id}`, {
      credentials: "include",
    }).then(async (response) => {
      if (response.ok) setAgents(await response.json());
    });
  }, [organization?.id]);
  const create = async () => {
    if (!organization?.id) return;
    const response = await fetch(`${API_URL}/api/agent`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: organization.id,
        name,
        expiresAt: new Date(expiry).toISOString(),
        permissions: { board: ["read"], task: ["read", "create", "update"] },
      }),
    });
    const body = await response.json();
    if (!response.ok)
      return toast.error(body.message ?? "Could not create agent");
    setSecret(body.key);
    setName("");
    setExpiry("");
    await load();
  };
  const remove = async (id: string) => {
    const response = await fetch(`${API_URL}/api/agent/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) await load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-medium">
        <Bot className="size-4" />
        Organization AI Agents
        <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
          Alpha
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Non-interactive identities. New agents receive only board read and task
        read/write access.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Agent name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name"
        />
        <Input
          aria-label="Agent expiry"
          type="datetime-local"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
        />
        <Button onClick={create} disabled={!name || !expiry}>
          <Plus className="size-4" /> Create
        </Button>
      </div>
      {secret && (
        <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
          <strong>Copy this secret now. It will not be shown again.</strong>
          <code className="mt-2 block break-all">{secret}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(secret)}
          >
            <Copy className="size-4" /> Copy
          </Button>
        </div>
      )}
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex items-center justify-between rounded border p-3"
        >
          <div>
            <span className="inline-flex items-center gap-1 font-medium">
              <Bot className="size-4" />
              {agent.name}{" "}
              <span className="rounded bg-muted px-1 text-xs">Agent</span>
            </span>
            <div className="text-xs text-muted-foreground">
              Expires {new Date(agent.expiresAt).toLocaleString()} · task
              read/create/update · board read
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => remove(agent.id)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
