import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Github, Link2Off, ShieldCheck } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  disconnectGithubDelegation,
  getGithubDelegationStatus,
  startGithubDelegation,
} from "@/fetchers/github-delegation";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/github",
)({ component: RouteComponent });

const statusQueryKey = ["github-delegation-status"];

function RouteComponent() {
  const queryClient = useQueryClient();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const { data: status, isLoading, error } = useQuery({
    queryKey: statusQueryKey,
    queryFn: getGithubDelegationStatus,
  });
  const connect = useMutation({ mutationFn: startGithubDelegation });
  const disconnect = useMutation({ mutationFn: disconnectGithubDelegation });

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
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
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

  if (isLoading) {
    return <GithubDelegationSkeleton />;
  }

  const permissions = status?.scope?.split(/[\s,]+/).filter(Boolean) ?? [];
  const displayName = status?.githubLogin || "GitHub account";

  return (
    <>
      <PageTitle title="GitHub" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">GitHub</h1>
          <p className="text-muted-foreground">
            Connect your personal GitHub identity so Kaneo can perform GitHub actions on your behalf.
          </p>
        </div>

        {error ? (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>GitHub connection unavailable</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "We could not load your GitHub connection."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : status?.connected ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Connected account</CardTitle>
                <CardDescription>
                  Kaneo will use this personal GitHub identity only for actions you initiate.
                </CardDescription>
              </CardHeader>
              <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-11 border">
                    <AvatarFallback>{getInitials(displayName, "GH")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{displayName}</p>
                    <p className="text-sm text-muted-foreground">@{displayName}</p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={`https://github.com/${displayName}`} rel="noreferrer" target="_blank">
                    View GitHub profile <ExternalLink />
                  </a>
                </Button>
              </CardPanel>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> Granted permissions</CardTitle>
                <CardDescription>
                  These are the permissions granted to Kaneo through your personal authorization.
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
                  <p className="text-sm text-muted-foreground">GitHub did not return a detailed permission list.</p>
                )}
              </CardPanel>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle>Disconnect GitHub</CardTitle>
                <CardDescription>
                  Kaneo will no longer be able to act using this GitHub identity. You can reconnect at any time.
                </CardDescription>
              </CardHeader>
              <CardPanel>
                <Button onClick={() => setDisconnectOpen(true)} variant="destructive">
                  <Link2Off /> Disconnect account
                </Button>
              </CardPanel>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Connect your GitHub account</CardTitle>
              <CardDescription>
                Authorize Kaneo with the GitHub account you want it to use for your own actions. This is separate from any organization GitHub App installation.
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm text-muted-foreground">
                You will be redirected to GitHub to review and approve the requested permissions.
              </p>
              <Button disabled={connect.isPending} onClick={handleConnect}>
                <Github /> {connect.isPending ? "Opening GitHub…" : "Connect GitHub"}
              </Button>
            </CardPanel>
          </Card>
        )}
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your GitHub account?</AlertDialogTitle>
            <AlertDialogDescription>
              Kaneo will immediately stop using this identity for actions on your behalf.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button disabled={disconnect.isPending} onClick={handleDisconnect} variant="destructive">
              {disconnect.isPending ? "Disconnecting…" : "Disconnect account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GithubDelegationSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2"><Skeleton className="h-8 w-28" /><Skeleton className="h-5 w-2/3" /></div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
