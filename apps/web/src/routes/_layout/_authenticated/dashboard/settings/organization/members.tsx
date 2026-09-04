import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import { OrganizationMembersGroups } from "@/components/team/organization-members-groups";
import { Button } from "@/components/ui/button";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetFullOrganization from "@/hooks/queries/organization/use-get-full-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { data: fullOrganization } = useGetFullOrganization({ organizationId });
  const { canInviteUsers, isAdmin } = useOrganizationPermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium text-base">
            {t("team:members.title", { defaultValue: "Members" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("settings:organizationMembers.description", {
              defaultValue: "People and agents with access to this workspace.",
            })}
          </p>
        </div>
        {canInvite && (
          <Button
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => setIsInviteOpen(true)}
          >
            <UserPlus className="h-3 w-3" />
            {t("team:members.inviteMember")}
          </Button>
        )}
      </div>

      <OrganizationMembersGroups
        organizationId={organizationId}
        users={fullOrganization?.members ?? []}
        invitations={fullOrganization?.invitations ?? []}
        canManageAgents={isAdmin}
      />

      <InviteTeamMemberModal
        open={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </div>
  );
}
