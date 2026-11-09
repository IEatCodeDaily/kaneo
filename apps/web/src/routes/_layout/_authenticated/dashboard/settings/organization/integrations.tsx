import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { OrganizationGithubConnection } from "@/components/connections/organization-github-connection";
import { OrganizationTeamsIntegration } from "@/components/connections/organization-teams-integration";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/integrations",
)({ component: RouteComponent });

/** Organization-wide integrations, one standard section per provider. */
function RouteComponent() {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle title={t("settings:integrations.title")} />
      <div className="max-w-3xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:integrations.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:integrations.subtitle")}
          </p>
        </div>
        <OrganizationTeamsIntegration />
        <OrganizationGithubConnection />
      </div>
    </>
  );
}
