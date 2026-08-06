import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Github, Unlink } from "lucide-react";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import getGitHubAppInfo from "@/fetchers/github-integration/get-app-info";
import {
  useDisconnectOrganizationGithubInstallation,
} from "@/hooks/mutations/organization-github/use-organization-github-installations";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationGithubInstallations } from "@/hooks/queries/organization-github/use-organization-github-installations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/github",
)({ component: RouteComponent });

function RouteComponent() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const organizationId = organization?.id ?? "";
  const canManage = canManageOrganization();
  const { data: installations = [], isLoading } =
    useOrganizationGithubInstallations(organizationId);
  const { data: appInfo } = useQuery({
    queryFn: getGitHubAppInfo,
    queryKey: ["github-app-info"],
  });
  const disconnectInstallation = useDisconnectOrganizationGithubInstallation();
  const installUrl = appInfo?.appName
    ? `https://github.com/apps/${appInfo.appName}/installations/new`
    : null;

  const handleDisconnect = async (installationId: number) => {
    if (!organizationId) return;
    try {
      await disconnectInstallation.mutateAsync({ installationId, organizationId });
      toast.success("GitHub App disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect GitHub App");
    }
  };

  return (
    <>
      <PageTitle title="GitHub" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">GitHub</h1>
          <p className="text-muted-foreground">
            Install the Kaneo GitHub App for the account or repositories this organization should use.
          </p>
        </div>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Install the GitHub App</CardTitle>
              <CardDescription>
                GitHub controls which account and repositories the app can access. After installation, come back here — Kaneo registers it automatically.
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-wrap items-center gap-3">
              {/* Base UI Button composes via `render`, not `asChild`; using
                  asChild left a disabled <button> wrapping a dead anchor. */}
              {installUrl ? (
                <Button
                  render={
                    <a href={installUrl} rel="noreferrer" target="_blank" />
                  }
                >
                  <Github />
                  Install GitHub App
                  <ExternalLink />
                </Button>
              ) : (
                <Button disabled>
                  <Github />
                  Install GitHub App
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Choose the GitHub account and repository access on GitHub. Nothing is selected or exposed inside Kaneo.
              </p>
            </CardPanel>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>GitHub App access</CardTitle>
              <CardDescription>
                An organization administrator can install or disconnect the GitHub App.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Active installations</h2>
            <p className="text-sm text-muted-foreground">
              These installations are available for connecting repositories in this organization.
            </p>
          </div>
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-20 w-full" /></div>
          ) : installations.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Github /></EmptyMedia>
                <EmptyTitle>No GitHub App installation yet</EmptyTitle>
                <EmptyDescription>
                  {canManage ? "Install the GitHub App above, then return here." : "Ask an organization administrator to install the GitHub App."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {installations.map((installation) => {
                const accountName = installation.accountLogin ?? "GitHub account";
                return (
                  <Card key={installation.installationId}>
                    <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-10 border">
                          <AvatarImage alt={accountName} src={installation.accountAvatarUrl ?? undefined} />
                          <AvatarFallback>{getInitials(accountName, "GH")}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{accountName}</p>
                          <p className="text-sm text-muted-foreground">
                            {installation.repositorySelection === "all" ? "All repositories" : "Selected repositories"}
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <Button disabled={disconnectInstallation.isPending} onClick={() => handleDisconnect(installation.installationId)} size="sm" variant="outline">
                          <Unlink /> Disconnect
                        </Button>
                      )}
                    </CardPanel>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
