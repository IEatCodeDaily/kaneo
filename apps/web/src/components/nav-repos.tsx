import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronRight, CircleDot, GitPullRequest } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";

export function NavRepos() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const reposEnabled = Boolean(
    (
      organization as
        | (typeof organization & { reposEnabled?: boolean })
        | undefined
    )?.reposEnabled,
  );
  const { data: repos } = useGetRepos({
    organizationId: organization?.id || "",
    enabled: reposEnabled,
  });
  const navigate = useNavigate();
  const { organizationId: currentOrganizationId, repoId: currentRepoId } =
    useParams({
      strict: false,
    });

  const isCurrentRepo = (repoId: string) =>
    currentRepoId === repoId && currentOrganizationId === organization?.id;

  if (!organization || !reposEnabled) return null;

  return (
    <Collapsible className="group/collapsible" defaultOpen>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
        <CollapsibleTrigger
          className="data-panel-open:[&_svg]:rotate-90"
          render={
            <SidebarGroupLabel className="h-7 cursor-pointer justify-between px-0 text-sidebar-accent-foreground" />
          }
        >
          <span>{t("navigation:sidebar.repos")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {repos?.map((repo) => (
                <SidebarMenuItem key={repo.id}>
                  <SidebarMenuButton
                    className="h-8 gap-0 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                    isActive={isCurrentRepo(repo.id)}
                    onClick={() =>
                      navigate({
                        to: "/dashboard/organization/$organizationId/repo/$repoId/issues",
                        params: {
                          organizationId: organization.id,
                          repoId: repo.id,
                        },
                      })
                    }
                    size="default"
                  >
                    <span className="truncate">{repo.name}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-[11px] text-sidebar-foreground/70">
                      <span className="flex items-center gap-0.5">
                        <CircleDot className="h-3 w-3" />
                        {repo.openIssueCount}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <GitPullRequest className="h-3 w-3" />
                        {repo.openPullRequestCount}
                      </span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}
