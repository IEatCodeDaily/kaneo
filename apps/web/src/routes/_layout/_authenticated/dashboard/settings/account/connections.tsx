import { createFileRoute } from "@tanstack/react-router";
import { AccountGithubConnection } from "@/components/connections/account-github-connection";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/connections",
)({ component: RouteComponent });

function RouteComponent() {
  return (
    <>
      <PageTitle title="Connections" />
      <div className="max-w-3xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-muted-foreground">
            Authorize your personal GitHub account for actions you initiate from
            Kaneo.
          </p>
        </div>
        <AccountGithubConnection />
      </div>
    </>
  );
}
