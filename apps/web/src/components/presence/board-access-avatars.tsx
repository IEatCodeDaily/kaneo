import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiUrl } from "@/fetchers/get-api-url";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

type ResourceType = "board" | "repo";

type Grant = {
  id: string;
  userId: string | null;
  teamId: string | null;
  privilege: "view" | "edit" | "manage";
};

type AccessEntry = {
  key: string;
  kind: "member" | "team";
  name: string;
  detail: string;
  image?: string | null;
};

type BoardAccessAvatarsProps = {
  organizationId: string;
  resourceId: string;
  resourceType?: ResourceType;
  className?: string;
  maxVisible?: number;
};

/**
 * Avatar cluster for the topbar showing who and which teams can reach this
 * board. With no resource grants every organization member has access (same
 * rule the resource-grant editor states), so we fall back to the member list.
 *
 * There is no presence/heartbeat signal in the API today (the board websocket
 * only broadcasts data mutations, never a member roster), so no online/offline
 * dot is rendered — that needs a backend presence channel first.
 */
export default function BoardAccessAvatars({
  organizationId,
  resourceId,
  resourceType = "board",
  className,
  maxVisible = 4,
}: BoardAccessAvatarsProps) {
  const { t } = useTranslation();
  // NOTE: this hook resolves to `{ members, total }` — an object, not an array.
  const { data: organizationMembers } =
    useGetActiveOrganizationMembers(organizationId);
  const members = organizationMembers?.members ?? [];

  const { data: grants = [] } = useQuery<Grant[]>({
    queryKey: ["resource-grants", organizationId, resourceType, resourceId],
    enabled: Boolean(organizationId && resourceId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(
          `resource-grant/${organizationId}/${resourceType}/${resourceId}`,
        ),
        { credentials: "include" },
      );
      if (!response.ok) return [];
      return response.json();
    },
    retry: false,
  });

  const hasTeamGrant = grants.some((grant) => Boolean(grant.teamId));
  const { data: teams = [] } = useQuery({
    queryKey: ["organization-teams", organizationId, "board-access"],
    enabled: Boolean(organizationId) && hasTeamGrant,
    retry: false,
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) return [];
      return result.data ?? [];
    },
  });

  const grantedUserIds = grants
    .map((grant) => grant.userId)
    .filter((id): id is string => Boolean(id));

  const memberEntries: AccessEntry[] = (
    grantedUserIds.length > 0
      ? members.filter((member) => grantedUserIds.includes(member.userId))
      : members
  ).map((member) => ({
    key: `member-${member.userId}`,
    kind: "member" as const,
    name: member.user?.name || member.user?.email || t("common:unknown"),
    detail: member.role ?? "",
    image: member.user?.image ?? null,
  }));

  const teamEntries: AccessEntry[] = grants
    .filter((grant) => Boolean(grant.teamId))
    .map((grant) => {
      const team = teams.find((item) => item.id === grant.teamId);
      return {
        key: `team-${grant.teamId}`,
        kind: "team" as const,
        name: team?.name ?? t("tasks:access.team"),
        detail: grant.privilege,
      };
    });

  const entries = [...teamEntries, ...memberEntries];

  if (entries.length === 0) return null;

  const visible = entries.slice(0, maxVisible);
  const overflow = entries.length - visible.length;

  return (
    <TooltipProvider>
      <div
        data-testid="board-access-avatars"
        data-slot="board-access-avatars"
        aria-label={t("tasks:access.title")}
        className={cn("flex items-center", className)}
      >
        {visible.map((entry) => (
          <Tooltip key={entry.key}>
            <TooltipTrigger
              render={
                <span
                  data-testid={`board-access-avatar-${entry.key}`}
                  className="-ml-1.5 first:ml-0"
                >
                  <Avatar className="size-6 border border-background ring-1 ring-border">
                    {entry.kind === "member" && entry.image ? (
                      <AvatarImage src={entry.image} alt={entry.name} />
                    ) : null}
                    <AvatarFallback className="text-[10px]">
                      {entry.kind === "team" ? (
                        <Users className="size-3" aria-hidden="true" />
                      ) : (
                        getInitials(entry.name)
                      )}
                    </AvatarFallback>
                  </Avatar>
                </span>
              }
            />
            <TooltipContent>
              <span className="text-[10px]">
                {entry.detail ? `${entry.name} · ${entry.detail}` : entry.name}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <span
            data-testid="board-access-avatar-overflow"
            className="-ml-1.5 flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px] font-medium text-muted-foreground ring-1 ring-border"
          >
            +{overflow}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
