import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  Github,
  Link2Off,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  useConnectGithubDelegation,
  useDisconnectGithubDelegation,
} from "@/hooks/mutations/github-delegation/use-github-delegation";
import { useDisconnectOrganizationGithubInstallation } from "@/hooks/mutations/organization-github/use-organization-github-installations";
import { useGithubDelegationStatus } from "@/hooks/queries/github-delegation/use-github-delegation-status";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationGithubInstallations } from "@/hooks/queries/organization-github/use-organization-github-installations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/connections",
)({ component: RouteComponent });

function RouteComponent() {
  return (
    <>
      <PageTitle title="Connections" />
      <div className="mx-auto max-w-4xl space-y-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-muted-foreground">
            GitHub connects to Kaneo in two independent layers: your personal
            account authorization, and the GitHub App installed for this
            organization.
          </p>
        </div>

        <AccountConnectionSection />
        <OrganizationConnectionSection />
      </div>
    </>
  );
}

function SectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function AccountConnectionSection() {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const { data: status, error, isLoading } = useGithubDelegationStatus();
  const connect = useConnectGithubDelegation();
  const disconnect = useDisconnectGithubDelegation();

  const handleConnect = async () => {
    try {
      const { url } = await connect.mutateAsync();
      window.location.assign(url);
    } catch (connectError) {
      toast.error(
        connectError instanceof Error
          ? connectError.message
          : "Could not start GitHub connection.",
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      setDisconnectOpen(false);
      toast.success("GitHub account disconnected.");
    } catch (disconnectError) {
      toast.error(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect GitHub account.",
      );
    }
  };

  const permissions = status?.scope?.split(/[\s,]+/).filter(Boolean) ?? [];
  const displayName = status?.githubLogin || "GitHub account";

  return (
    <section className="space-y-4">
      <SectionHeading
        description="Used only for GitHub actions you personally initiate from Kaneo."
        title="Your GitHub account"
      />

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>GitHub connection unavailable</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : "We could not load your GitHub connection."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : status?.connected ? (
        <div className="space-y-4">
          <Card>
            <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10 border">
                  <AvatarFallback>
                    {getInitials(displayName, "GH")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{displayName}</p>
                    <Badge variant="secondary">Connected</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    @{displayName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  render={
                    <a
                      href={`https://github.com/${displayName}`}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  View profile <ExternalLink />
                </Button>
                <Button
                  onClick={() => setDisconnectOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Link2Off /> Disconnect
                </Button>
              </div>
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" /> Granted permissions
              </CardTitle>
              <CardDescription>
                Permissions you granted to Kaneo through your personal
                authorization.
              </CardDescription>
            </CardHeader>
            <CardPanel>
              {permissions.length > 0 ? (
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {permissions.map((permission) => (
                    <li className="flex items-center gap-2" key={permission}>
                      <Check className="size-4 text-emerald-600" /> {permission}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  GitHub did not return a detailed permission list.
                </p>
              )}
            </CardPanel>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connect your GitHub account</CardTitle>
            <CardDescription>
              Authorize Kaneo with the GitHub account it should act as for you.
              You will be redirected to GitHub to review the requested
              permissions.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <Button disabled={connect.isPending} onClick={handleConnect}>
              <Github />
              {connect.isPending ? "Opening GitHub…" : "Connect GitHub"}
            </Button>
          </CardPanel>
        </Card>
      )}

      <AlertDialog onOpenChange={setDisconnectOpen} open={disconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your GitHub account?</AlertDialogTitle>
            <AlertDialogDescription>
              Kaneo will immediately stop using this identity for actions on
              your behalf. Organization GitHub App installations are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button
              disabled={disconnect.isPending}
              onClick={handleDisconnect}
              variant="destructive"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function OrganizationConnectionSection() {
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
      await disconnectInstallation.mutateAsync({
        installationId,
        organizationId,
      });
      toast.success("GitHub App disconnected");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disconnect GitHub App",
      );
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeading
        description={
          organization?.name
            ? `Repository access shared by everyone in ${organization.name}.`
            : "Repository access shared by everyone in this organization."
        }
        title="Organization GitHub App"
      />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Install the GitHub App</CardTitle>
            <CardDescription>
              GitHub controls which account and repositories the app can access.
              After installing, come back here — Kaneo registers it
              automatically.
            </CardDescription>
          </CardHeader>
          {/* Base UI Button composes via `render`, not `asChild`; using
              asChild left a disabled <button> wrapping a dead anchor. */}
          <CardPanel className="flex flex-wrap items-center gap-3">
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
              Nothing is selected or exposed inside Kaneo.
            </p>
          </CardPanel>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>GitHub App access</CardTitle>
            <CardDescription>
              An organization administrator can install or disconnect the GitHub
              App.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : installations.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Github />
            </EmptyMedia>
            <EmptyTitle>No GitHub App installation yet</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Install the GitHub App above, then return here."
                : "Ask an organization administrator to install the GitHub App."}
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
                      <AvatarImage
                        alt={accountName}
                        src={installation.accountAvatarUrl ?? undefined}
                      />
                      <AvatarFallback>
                        {getInitials(accountName, "GH")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{accountName}</p>
                      <p className="text-sm text-muted-foreground">
                        {installation.repositorySelection === "all"
                          ? "All repositories"
                          : "Selected repositories"}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      disabled={disconnectInstallation.isPending}
                      onClick={() =>
                        handleDisconnect(installation.installationId)
                      }
                      size="sm"
                      variant="outline"
                    >
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
  );
}
