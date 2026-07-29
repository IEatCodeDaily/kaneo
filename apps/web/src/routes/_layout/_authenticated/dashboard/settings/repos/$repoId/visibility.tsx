import { createFileRoute, useParams } from "@tanstack/react-router";
import PageTitle from "@/components/page-title";
import { ResourceGrantEditor } from "@/components/resource-grant-editor";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/repos/$repoId/visibility",
)({ component: RepoVisibility });

function RepoVisibility() {
  const { repoId } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();

  return (
    <>
      <PageTitle title="Repository visibility" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Repository visibility</h1>
          <p className="text-muted-foreground">
            Choose which organization members and teams can access this
            repository.
          </p>
        </div>
        {organization?.id && repoId ? (
          <ResourceGrantEditor
            organizationId={organization.id}
            resourceType="repo"
            resourceId={repoId}
            disabled={!canManageOrganization()}
          />
        ) : null}
      </div>
    </>
  );
}
