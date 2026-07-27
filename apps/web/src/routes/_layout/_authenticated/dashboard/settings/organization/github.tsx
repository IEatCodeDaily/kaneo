import { createFileRoute } from "@tanstack/react-router";
import { Github, Unlink } from "lucide-react";
import { useMemo, useState } from "react";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFrame,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConnectOrganizationGithubInstallation,
  useDisconnectOrganizationGithubInstallation,
} from "@/hooks/mutations/organization-github/use-organization-github-installations";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  useAvailableOrganizationGithubInstallations,
  useOrganizationGithubInstallations,
} from "@/hooks/queries/organization-github/use-organization-github-installations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/github",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const organizationId = organization?.id ?? "";
  const canManage = canManageOrganization();
  const [selectedInstallationId, setSelectedInstallationId] = useState<string>("");

  const { data: installations = [], isLoading: isLoadingInstallations } =
    useOrganizationGithubInstallations(organizationId);
  const {
    data: availableInstallations = [],
    isLoading: isLoadingAvailable,
    error: availableError,
  } = useAvailableOrganizationGithubInstallations(organizationId, canManage);
  const connectInstallation = useConnectOrganizationGithubInstallation();
  const disconnectInstallation = useDisconnectOrganizationGithubInstallation();

  const connectableInstallations = useMemo(() => {
    const connectedIds = new Set(
      installations.map((installation) => installation.installationId),
    );
    return availableInstallations.filter(
      (installation) => !connectedIds.has(installation.installationId),
    );
  }, [availableInstallations, installations]);

  const handleConnect = async () => {
    if (!organizationId || !selectedInstallationId) return;

    try {
      await connectInstallation.mutateAsync({
        installationId: Number(selectedInstallationId),
        organizationId,
      });
      setSelectedInstallationId("");
      toast.success("GitHub account connected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect GitHub account",
      );
    }
  };

  const handleDisconnect = async (installationId: number) => {
    if (!organizationId) return;

    try {
      await disconnectInstallation.mutateAsync({ installationId, organizationId });
      toast.success("GitHub account disconnected");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disconnect GitHub account",
      );
    }
  };

  return (
    <>
      <PageTitle title="GitHub" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">GitHub</h1>
          <p className="text-muted-foreground">
            Connect GitHub App accounts to make their repositories available to this organization.
          </p>
        </div>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect a GitHub account</CardTitle>
              <CardDescription>
                Choose an account where the GitHub App is installed, then connect it to this organization.
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <label className="text-sm font-medium" htmlFor="github-account">
                  GitHub account
                </label>
                <Select
                  disabled={isLoadingAvailable || connectableInstallations.length === 0}
                  onValueChange={(value) => setSelectedInstallationId(value ?? "")}
                  value={selectedInstallationId || null}
                >
                  <SelectTrigger id="github-account">
                    <SelectValue
                      placeholder={
                        isLoadingAvailable
                          ? "Loading GitHub accounts…"
                          : connectableInstallations.length === 0
                            ? "No additional accounts available"
                            : "Select a GitHub account"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {connectableInstallations.map((installation) => (
                      <SelectItem
                        key={installation.installationId}
                        value={String(installation.installationId)}
                      >
                        {installation.accountLogin ?? "GitHub account"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                disabled={!selectedInstallationId || connectInstallation.isPending}
                onClick={handleConnect}
              >
                <Github />
                {connectInstallation.isPending
                  ? "Connecting…"
                  : "Connect GitHub account"}
              </Button>
            </CardPanel>
            {availableError && (
              <CardFrame className="pt-0 text-sm text-destructive">
                Unable to load GitHub accounts. {availableError.message}
              </CardFrame>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>GitHub account access</CardTitle>
              <CardDescription>
                Only organization administrators can connect or disconnect GitHub accounts.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Connected accounts</h2>
            <p className="text-sm text-muted-foreground">
              Repositories from these GitHub App installations can be used by this organization.
            </p>
          </div>

          {isLoadingInstallations ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : installations.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Github />
                </EmptyMedia>
                <EmptyTitle>No GitHub accounts connected</EmptyTitle>
                <EmptyDescription>
                  {canManage
                    ? "Select an account above to connect its GitHub App installation."
                    : "An organization administrator can connect a GitHub account here."}
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
                          <AvatarFallback>{getInitials(accountName, "GH")}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{accountName}</p>
                          <p className="text-sm text-muted-foreground">
                            {installation.accountType ?? "GitHub"} account
                            {installation.repositorySelection
                              ? ` · ${installation.repositorySelection} repositories`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {canManage && (
                        <Button
                          disabled={disconnectInstallation.isPending}
                          onClick={() => handleDisconnect(installation.installationId)}
                          size="sm"
                          variant="outline"
                        >
                          <Unlink />
                          {disconnectInstallation.isPending
                            ? "Disconnecting…"
                            : "Disconnect"}
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
