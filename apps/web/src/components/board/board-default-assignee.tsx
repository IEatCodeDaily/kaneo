import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import {
  type PrincipalOption,
  PrincipalSelector,
} from "@/components/principal-selector";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

type Board = {
  id: string;
  organizationId?: string;
  defaultAssigneeId?: string | null;
  defaultAssigneeTeamId?: string | null;
};

type Props = {
  board?: Board | null;
  canEdit: boolean;
  onUpdate: (updates: {
    defaultAssigneeId?: string | null;
    defaultAssigneeTeamId?: string | null;
  }) => Promise<unknown>;
  onDone: () => Promise<unknown>;
};

export function BoardDefaultAssignee({
  board,
  canEdit,
  onUpdate,
  onDone,
}: Props) {
  const organizationId = board?.organizationId ?? "";
  const [busy, setBusy] = useState(false);

  const members = useQuery({
    queryKey: ["organization-members", organizationId, "default-assignee"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listMembers({
        query: { organizationId },
      });
      if (result.error)
        throw new Error(result.error.message || "Failed to load members");
      return result.data.members;
    },
  });

  const teams = useQuery({
    queryKey: ["organization-teams", organizationId, "default-assignee"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error)
        throw new Error(result.error.message || "Failed to load teams");
      return result.data ?? [];
    },
  });

  const options: PrincipalOption[] = [
    ...(members.data ?? []).map(
      (m: { userId: string; user: { name: string; email: string } }) => ({
        id: m.userId,
        kind: "member" as const,
        name: m.user.name,
        detail: m.user.email,
      }),
    ),
    ...(teams.data ?? []).map((t: { id: string; name: string }) => ({
      id: t.id,
      kind: "team" as const,
      name: t.name,
      detail: "Team",
    })),
  ];

  const selectedId = board?.defaultAssigneeId ?? board?.defaultAssigneeTeamId;
  const selected = options.find((o) => o.id === selectedId) ?? null;

  const handleChange = async (selection: PrincipalOption[]) => {
    if (!board) return;
    const pick = selection[0];
    setBusy(true);
    try {
      if (!pick) {
        await onUpdate({
          defaultAssigneeId: null,
          defaultAssigneeTeamId: null,
        });
      } else if (pick.kind === "member") {
        await onUpdate({
          defaultAssigneeId: pick.id,
          defaultAssigneeTeamId: null,
        });
      } else {
        await onUpdate({
          defaultAssigneeId: null,
          defaultAssigneeTeamId: pick.id,
        });
      }
      await onDone();
      toast.success(pick ? "Default assignee set" : "Default assignee cleared");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update assignee",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!board) return null;

  return (
    <div className="flex items-center gap-2">
      <PrincipalSelector
        aria-label="Default assignee"
        className="min-w-48 max-w-xs"
        disabled={!canEdit || busy}
        emptyMessage="No members or teams."
        kinds={["member", "team"]}
        loading={members.isLoading || teams.isLoading}
        onValueChange={handleChange}
        options={options}
        placeholder="No default"
        searchPlaceholder="Search members or teams…"
        value={selected ? [selected] : []}
      />
      {canEdit && selectedId ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => handleChange([])}
        >
          <X className="size-4" />
          <span className="sr-only">Clear default assignee</span>
        </Button>
      ) : null}
    </div>
  );
}
