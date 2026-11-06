import { createFileRoute, useLocation } from "@tanstack/react-router";
import { FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import ResourceSettingsShell from "@/components/settings/resource-settings-shell";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/repos",
)({ component: RepoSettings });

function RepoSettings() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id ?? "",
    enabled:
      (
        organization as
          | (typeof organization & { reposEnabled?: boolean })
          | undefined
      )?.reposEnabled === true,
  });
  const { pathname } = useLocation();
  return (
    <ResourceSettingsShell
      base="/dashboard/settings/repos"
      icon={FolderGit2}
      title={t("navigation:sidebar.repos")}
      items={repos.map((repo) => ({
        id: repo.id,
        label: `${repo.owner}/${repo.name}`,
      }))}
      tabs={[
        { segment: "visibility", label: t("settings:repoVisibility.title") },
      ]}
      activeId={pathname.match(/\/settings\/repos\/([^/]+)/)?.[1]}
      activeSegment={pathname.substring(pathname.lastIndexOf("/") + 1)}
      emptyLabel={t("settings:repoSwitcher.noRepos")}
      selectLabel={t("settings:repoSwitcher.selectRepo")}
    />
  );
}
