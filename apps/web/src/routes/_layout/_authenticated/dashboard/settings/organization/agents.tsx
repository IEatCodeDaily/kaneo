import { createFileRoute } from "@tanstack/react-router";
import PageTitle from "@/components/page-title";
import PermissionDenied from "@/components/permission-denied";
import { AgentManager } from "@/components/settings/agent-manager";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

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
  const { role } = useOrganizationPermission();
  if (role !== "owner" && role !== "admin") {
    return <PermissionDenied />;
  }

  return (
    <>
      <PageTitle title="AI agents" />
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">AI agents</h1>
          <p className="text-muted-foreground">
            Non-interactive identities that act in this organization through the
            API. Each agent has its own member record, explicit scopes, and a
            mandatory expiry.
          </p>
        </div>
        <AgentManager />
      </div>
    </>
  );
}
