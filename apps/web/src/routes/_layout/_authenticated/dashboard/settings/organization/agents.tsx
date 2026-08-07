import { createFileRoute, redirect } from "@tanstack/react-router";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/agents",
)({
  component: AgentSettings,
});

/**
 * AI agents belong to an organization, not to a personal account: their key is
 * scoped to one organization and only an owner/admin may issue or revoke one.
 * This previously lived under Account → Developer, where organization admins
 * could not find it.
 */
function AgentSettings() {
  const { data: organization } = useActiveOrganization();
  if (!organization?.id) return null;
  throw redirect({
    to: "/dashboard/organization/$organizationId/members",
    params: { organizationId: organization.id },
    search: { tab: "members" },
  });
}
