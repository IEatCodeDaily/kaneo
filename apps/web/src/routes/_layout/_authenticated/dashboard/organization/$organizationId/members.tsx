import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import OrganizationLayout from "@/components/common/organization-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import useGetFullOrganization from "@/hooks/queries/organization/use-get-full-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import { TeamsManagement } from "../../settings/organization/teams";

type MembersTab = "members" | "teams";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationId/members",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): { tab: MembersTab } => ({
    tab: search.tab === "teams" ? "teams" : "members",
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const { data: organization } = useGetFullOrganization({ organizationId });
  const { canInviteUsers, isAdmin } = useOrganizationPermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [createTeamSignal, setCreateTeamSignal] = useState(0);
  const [activeTab, setActiveTab] = useState<MembersTab>(tab);
  const isTeams = activeTab === "teams";

  useEffect(() => setActiveTab(tab), [tab]);

  const selectTab = (nextTab: MembersTab) => {
    // Commit the cheap local view switch before router/auth revalidation. The
    // URL update remains shareable and back/forward-safe, but no longer blocks
    // visible feedback behind a session request.
    flushSync(() => setActiveTab(nextTab));
    void navigate({
      to: "/dashboard/organization/$organizationId/members",
      params: { organizationId },
      search: { tab: nextTab },
      replace: true,
    });
  };

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <OrganizationLayout
        title={t("team:members.pageTitle")}
        headerNavigation={
          <div
            className="ml-2 inline-flex h-8 min-w-0 items-center gap-0.5 overflow-hidden rounded-lg border border-border/80 bg-background p-0.5"
            role="tablist"
            aria-label="Organization people"
          >
            {(["members", "teams"] as const).map((item) => (
              <Button
                key={item}
                role="tab"
                aria-selected={activeTab === item}
                variant="ghost"
                size="xs"
                className={cn(
                  "h-6 shrink-0 rounded-md px-2 text-xs font-medium capitalize transition-colors",
                  activeTab === item
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => selectTab(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        }
        headerActions={
          isTeams && isAdmin ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setCreateTeamSignal((value) => value + 1)}
              className="gap-1"
            >
              <Plus className="size-3" /> New team
            </Button>
          ) : canInvite ? (
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
        {isTeams ? (
          <TeamsManagement createTeamSignal={createTeamSignal} />
        ) : (
          <MembersTable
            organizationId={organizationId}
            users={organization?.members ?? []}
            invitations={organization?.invitations ?? []}
          />
        )}

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />
      </OrganizationLayout>
    </>
  );
}
