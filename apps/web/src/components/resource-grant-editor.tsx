import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  type PrincipalOption,
  PrincipalSelector,
} from "@/components/principal-selector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiUrl } from "@/fetchers/get-api-url";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

type ResourceType = "board" | "repo";
type Privilege = "view" | "edit" | "manage";
type PrincipalType = "user" | "team";
type Grant = {
  id: string;
  userId: string | null;
  teamId: string | null;
  privilege: Privilege;
};

type Props = {
  organizationId: string;
  resourceType: ResourceType;
  resourceId: string;
  disabled?: boolean;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
  return response.json();
}

export function ResourceGrantEditor({
  organizationId,
  resourceType,
  resourceId,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient();
  const [principalType, setPrincipalType] = useState<PrincipalType>("user");
  const [principalId, setPrincipalId] = useState("");
  const [privilege, setPrivilege] = useState<Privilege>("view");
  const queryKey = [
    "resource-grants",
    organizationId,
    resourceType,
    resourceId,
  ];
  const basePath = `resource-grant/${organizationId}/${resourceType}/${resourceId}`;

  const grants = useQuery<Grant[]>({
    queryKey,
    enabled: Boolean(organizationId && resourceId),
    queryFn: () => request(basePath),
  });
  const teams = useQuery({
    queryKey: ["organization-teams", organizationId],
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
  const members = useQuery({
    queryKey: ["organization-members", organizationId, "resource-grants"],
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

  const save = useMutation({
    mutationFn: (body: {
      principalType: PrincipalType;
      principalId: string;
      privilege: Privilege;
    }) => request(basePath, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setPrincipalId("");
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Visibility access updated");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to update access",
      ),
  });
  const remove = useMutation({
    mutationFn: (grantId: string) =>
      request(`${basePath}/${grantId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Access removed");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to remove access",
      ),
  });

  const principals: PrincipalOption[] =
    principalType === "user"
      ? (members.data ?? []).map((member) => ({
          id: member.userId,
          kind: "member" as const,
          name: member.user.name,
          detail: member.user.email,
        }))
      : (teams.data ?? []).map((team) => ({
          id: team.id,
          kind: "team" as const,
          name: team.name,
          detail: "Team",
        }));
  const selectedPrincipal = principals.find((item) => item.id === principalId);
  const nameFor = (grant: Grant) => {
    if (grant.userId) {
      const member = members.data?.find((item) => item.userId === grant.userId);
      return member?.user.name || member?.user.email || "Unknown member";
    }
    return (
      teams.data?.find((team) => team.id === grant.teamId)?.name ||
      "Unknown team"
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-md font-medium">Organization access</h2>
        <p className="text-xs text-muted-foreground">
          With no grants, every organization member has access. Adding a grant
          restricts access to the selected people and teams.
        </p>
      </div>
      <div className="space-y-3 rounded-md border border-border bg-sidebar p-4">
        {grants.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading access…</p>
        ) : null}
        {grants.data?.map((grant) => (
          <div key={grant.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{nameFor(grant)}</p>
              <p className="text-xs text-muted-foreground">
                {grant.userId ? "Member" : "Team"}
              </p>
            </div>
            <Select
              value={grant.privilege}
              disabled={disabled || save.isPending}
              onValueChange={(value) =>
                save.mutate({
                  principalType: grant.userId ? "user" : "team",
                  principalId: grant.userId || grant.teamId || "",
                  privilege: value as Privilege,
                })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue>
                  {grant.privilege === "view"
                    ? "View"
                    : grant.privilege === "edit"
                      ? "Edit"
                      : "Manage"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="manage">Manage</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled || remove.isPending}
              onClick={() => remove.mutate(grant.id)}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove access</span>
            </Button>
          </div>
        ))}
        {!grants.isLoading && grants.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Organization-wide access is enabled.
          </p>
        ) : null}
        <div className="border-t border-border pt-4">
          <Label className="mb-2 block">Add access</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              value={principalType}
              onValueChange={(value) => {
                setPrincipalType(value as PrincipalType);
                setPrincipalId("");
              }}
              disabled={disabled}
            >
              <SelectTrigger
                aria-label="Principal type"
                className="w-28"
                data-testid="principal-type"
              >
                <SelectValue>
                  {principalType === "user" ? "Member" : "Team"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
            <PrincipalSelector
              aria-label={`Select ${principalType === "user" ? "member" : "team"}`}
              className="min-w-56 flex-1"
              disabled={disabled}
              emptyMessage={`No matching ${principalType === "user" ? "members" : "teams"}.`}
              kinds={[principalType === "user" ? "member" : "team"]}
              loading={members.isLoading || teams.isLoading}
              onValueChange={(selection) =>
                setPrincipalId(selection[0]?.id ?? "")
              }
              options={principals}
              placeholder={`Select ${principalType === "user" ? "member" : "team"}`}
              searchPlaceholder={`Search ${principalType === "user" ? "members" : "teams"}…`}
              value={selectedPrincipal ? [selectedPrincipal] : []}
            />
            <Select
              value={privilege}
              onValueChange={(value) => setPrivilege(value as Privilege)}
              disabled={disabled}
            >
              <SelectTrigger className="w-32">
                <SelectValue>
                  {privilege === "view"
                    ? "View"
                    : privilege === "edit"
                      ? "Edit"
                      : "Manage"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="manage">Manage</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={disabled || !principalId || save.isPending}
              onClick={() =>
                save.mutate({ principalType, principalId, privilege })
              }
            >
              <Plus className="size-4" /> Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
