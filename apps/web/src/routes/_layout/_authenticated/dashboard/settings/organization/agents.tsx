import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/agents",
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/settings/organization/members",
      replace: true,
    });
  },
  component: AgentSettings,
});

/**
 * AI agents belong to an organization, not to a personal account: their key is
 * scoped to one organization and only an owner/admin may issue or revoke one.
 * This route redirects to the organization members surface where agents are
 * shown as first-class members and their credentials are managed.
 */
function AgentSettings() {
  return null;
}
