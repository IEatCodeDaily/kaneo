import { Bot, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import useCreateAgent from "@/hooks/mutations/agent/use-create-agent";
import useDeleteAgent from "@/hooks/mutations/agent/use-delete-agent";
import useGetAgents from "@/hooks/queries/agent/use-get-agents";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function AgentManager() {
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id;
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const { data: agents = [] } = useGetAgents(organizationId);
  const createAgent = useCreateAgent(organizationId);
  const deleteAgent = useDeleteAgent(organizationId);

  const create = async () => {
    if (!organizationId) return;
    try {
      const created = await createAgent.mutateAsync({
        organizationId,
        name,
        expiresAt: new Date(expiry).toISOString(),
        permissions: { board: ["read"], task: ["read", "create", "update"] },
      });
      setSecret(created.key);
      setName("");
      setExpiry("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create agent",
      );
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAgent.mutateAsync(id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete agent",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-medium">
        <Bot className="size-4" />
        Organization AI Agents
        <Badge variant="warning" size="sm">
          Alpha
        </Badge>
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
        <Button
          onClick={create}
          disabled={!name || !expiry || createAgent.isPending}
        >
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
              <Badge variant="secondary" size="sm">
                Agent
              </Badge>
            </span>
            <div className="text-xs text-muted-foreground">
              Expires {new Date(agent.expiresAt).toLocaleString()} · task
              read/create/update · board read
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove(agent.id)}
            disabled={deleteAgent.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
