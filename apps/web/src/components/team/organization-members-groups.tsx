import { Bot, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentManager } from "@/components/settings/agent-manager";
import type {
  OrganizationMember,
  OrganizationMemberInvitation,
} from "@/types/organization-member";
import MembersTable from "./members-table";

type Props = {
  organizationId: string;
  invitations: OrganizationMemberInvitation[];
  users: OrganizationMember[];
  canManageAgents: boolean;
};

export function OrganizationMembersGroups({
  organizationId,
  invitations,
  users,
  canManageAgents,
}: Props) {
  const { t } = useTranslation();
  const people = users.filter((member) => member.user.role !== "agent");

  return (
    <div className="space-y-8">
      <section aria-labelledby="people-heading" className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Users className="size-4 text-muted-foreground" />
          <h2 id="people-heading" className="text-sm font-semibold">
            {t("team.members.people")}
          </h2>
        </div>
        <MembersTable
          organizationId={organizationId}
          users={people}
          invitations={invitations}
        />
      </section>

      <section
        aria-labelledby="agents-heading"
        className="space-y-3 border-t pt-6"
      >
        <div className="flex items-center gap-2 px-1">
          <Bot className="size-4 text-muted-foreground" />
          <h2 id="agents-heading" className="text-sm font-semibold">
            {t("team.members.agents")}
          </h2>
        </div>
        {canManageAgents ? (
          <AgentManager />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {t("team.members.agentsManagedByAdmins")}
          </p>
        )}
      </section>
    </div>
  );
}
