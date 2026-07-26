import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import useGetFullOrganization from "@/hooks/queries/organization/use-get-full-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/$workspaceId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const { data: organization } = useGetFullOrganization({ organizationId });
  const { canInviteUsers } = useOrganizationPermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <OrganizationLayout
        title={t("team:members.pageTitle")}
        headerActions={
          canInvite ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsInviteOpen(true)}
              className="gap-1"
            >
              <UserPlus className="w-3 h-3" />
              {t("team:members.inviteMember")}
            </Button>
          ) : null
        }
      >
        <MembersTable
          organizationId={organizationId}
          users={organization?.members ?? []}
          invitations={organization?.invitations ?? []}
        />

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />
      </OrganizationLayout>
    </>
  );
}
