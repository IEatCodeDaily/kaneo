import { Bot, Copy, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import useCreateAgent from "@/hooks/mutations/agent/use-create-agent";
import useDeleteAgent from "@/hooks/mutations/agent/use-delete-agent";
import useReissueAgentToken from "@/hooks/mutations/agent/use-reissue-agent-token";
import useGetAgents from "@/hooks/queries/agent/use-get-agents";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Matches the API's minimum name length so the button can't submit a 400. */
const MIN_AGENT_NAME_LENGTH = 3;

export function AgentManager() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id;
  const nameInputId = useId();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const { data: agents = [] } = useGetAgents(organizationId);
  const createAgent = useCreateAgent(organizationId);
  const deleteAgent = useDeleteAgent(organizationId);
  const reissueToken = useReissueAgentToken(organizationId);

  const trimmedName = name.trim();
  const canCreate =
    Boolean(organizationId) &&
    trimmedName.length >= MIN_AGENT_NAME_LENGTH &&
    !createAgent.isPending;

  const create = async () => {
    if (!organizationId || !canCreate) return;
    try {
      const created = await createAgent.mutateAsync({
        organizationId,
        name: trimmedName,
        // Kept for API-key record compatibility only. Agent authorization is
        // derived from the agent member's organization role, not this map.
        permissions: { board: ["read"] },
      });
      setSecret(created.key);
      setName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:agentManager.createError"),
      );
    }
  };

  const reissue = async (id: string) => {
    try {
      const reissued = await reissueToken.mutateAsync(id);
      setSecret(reissued.key);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:agentManager.reissueError"),
      );
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAgent.mutateAsync(id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:agentManager.deleteError"),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-border bg-sidebar p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">
              {t("team:agentManager.title")}
            </p>
            <Badge variant="warning" size="sm">
              {t("team:agentManager.alphaBadge")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("team:agentManager.description")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={nameInputId}>
            {t("team:agentManager.nameLabel")}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/*
              max-w keeps the field a form control instead of a page-wide bar;
              size sm matches the header actions so Create does not out-weigh
              "Invite member", the page's actual primary action.
            */}
            <Input
              id={nameInputId}
              className="sm:max-w-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("team:agentManager.namePlaceholder")}
            />
            <Button
              className="min-h-11 sm:min-h-8 sm:w-auto"
              onClick={create}
              disabled={!canCreate}
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" />
              {t("team:agentManager.create")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("team:agentManager.tokenHint")}
          </p>
        </div>
      </div>

      {secret && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">
            {t("team:agentManager.secretWarning")}
          </p>
          <code className="block break-all rounded bg-background/60 p-2 text-xs">
            {secret}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(secret)}
          >
            <Copy className="size-4" />
            {t("team:agentManager.copy")}
          </Button>
        </div>
      )}

      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-muted-foreground" />
              {agent.name}
              <Badge variant="secondary" size="sm">
                {t("team:agentManager.agentBadge")}
              </Badge>
            </span>
            {/* The token is separate from the agent: it never expires and
                can be reissued without losing the agent's role or history. */}
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3" aria-hidden />
              {agent.token
                ? t("team:agentManager.tokenMeta", {
                    start: agent.token.start ?? "",
                    date: new Date(agent.token.createdAt).toLocaleDateString(),
                  })
                : t("team:agentManager.noToken")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onClick={() => reissue(agent.id)}
              disabled={reissueToken.isPending}
            >
              <RefreshCw className="size-4" />
              {t(
                agent.token
                  ? "team:agentManager.reissue"
                  : "team:agentManager.issue",
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("team:agentManager.revoke")}
              onClick={() => remove(agent.id)}
              disabled={deleteAgent.isPending}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
