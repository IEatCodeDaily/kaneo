import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  CircleDot,
  ExternalLink,
  GitPullRequest,
  MoreHorizontal,
  Plus,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { AddRepoDialog } from "@/components/repo/add-repo-dialog";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { useTargetRepoView } from "@/hooks/use-remembered-view";
import {
  intentPrefetchHandlers,
  prefetchRepoNavigation,
} from "@/lib/navigation-prefetch";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function NavRepos() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();
  const { canCreateBoards } = useOrganizationPermission();
  const canCreateRepo = canCreateBoards();
  const reposEnabled = Boolean(
    (
      organization as
        | (typeof organization & { reposEnabled?: boolean })
        | undefined
    )?.reposEnabled,
  );
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id || "",
    enabled: reposEnabled,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organizationId: currentOrganizationId, repoId: currentRepoId } =
    useParams({
      strict: false,
    });
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const hiddenRepoIds = useUserPreferencesStore((state) => state.hiddenRepoIds);
  const setRepoSidebarVisibility = useUserPreferencesStore(
    (state) => state.setRepoSidebarVisibility,
  );
  const visibleRepos = repos.filter(
    (repo) => !hiddenRepoIds.includes(`${user?.id}:${repo.id}`),
  );
  const hiddenRepos = repos.filter((repo) =>
    hiddenRepoIds.includes(`${user?.id}:${repo.id}`),
  );

  const isCurrentRepo = (repoId: string) =>
    currentRepoId === repoId && currentOrganizationId === organization?.id;

  // Switching repos keeps the current repo view; arriving fresh uses the last
  // repo view this user was in (persisted in localStorage).
  const targetRepoView = useTargetRepoView();

  if (!organization || !reposEnabled) return null;

  const openRepo = (repoId: string) =>
    navigate({
      to: `/dashboard/organization/$organizationId/repo/$repoId/${targetRepoView}`,
      params: {
        organizationId: organization.id,
        repoId,
      },
    });

  return (
    <SidebarGroup className="group/repos group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
      <div className="flex h-7 items-center">
        <SidebarGroupLabel
          className="h-7 min-w-0 flex-1 cursor-pointer gap-2 px-0 text-sidebar-accent-foreground hover:text-sidebar-foreground"
          render={<button type="button" />}
          onClick={() =>
            navigate({
              to: "/dashboard/organization/$organizationId/repo",
              params: { organizationId: organization.id },
            })
          }
        >
          <span>{t("navigation:sidebar.repos")}</span>
          <Badge className="h-4 px-1 text-[9px]" variant="secondary">
            Beta
          </Badge>
        </SidebarGroupLabel>
        {canCreateRepo && (
          <button
            aria-label="Add repository"
            className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/repos:opacity-100"
            onClick={() => setAddRepoOpen(true)}
            type="button"
          >
            <Plus className="size-3.5" />
          </button>
        )}
        {hiddenRepos.length > 0 && (
          <Menu>
            <MenuTrigger
              render={
                <button
                  aria-label="Repository sidebar options"
                  className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  type="button"
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">
              {hiddenRepos.map((repo) => (
                <MenuItem
                  key={repo.id}
                  onClick={() =>
                    setRepoSidebarVisibility(user?.id ?? "", repo.id, true)
                  }
                >
                  Show {repo.name}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        )}
      </div>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {visibleRepos.map((repo) => (
            <ContextMenu key={repo.id}>
              <ContextMenuTrigger asChild>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="h-8 gap-0 ps-3.5 pe-8 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent data-[active=true]:bg-sidebar-accent data-[active=true]:shadow-sm/5"
                    isActive={isCurrentRepo(repo.id)}
                    onClick={() => openRepo(repo.id)}
                    {...intentPrefetchHandlers(() =>
                      prefetchRepoNavigation(queryClient, repo.id),
                    )}
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
                  <Menu>
                    <MenuTrigger
                      render={
                        <SidebarMenuAction
                          aria-label={`Actions for ${repo.name}`}
                          showOnHover
                        />
                      }
                    >
                      <MoreHorizontal />
                    </MenuTrigger>
                    <MenuPopup align="end" side="right">
                      <MenuItem onClick={() => openRepo(repo.id)}>
                        <ExternalLink />
                        Open
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          navigate({
                            to: "/dashboard/settings/repos/$repoId/visibility",
                            params: { repoId: repo.id },
                          })
                        }
                      >
                        <Settings />
                        Settings
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          setRepoSidebarVisibility(
                            user?.id ?? "",
                            repo.id,
                            false,
                          )
                        }
                      >
                        Hide from sidebar
                      </MenuItem>
                    </MenuPopup>
                  </Menu>
                </SidebarMenuItem>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem onClick={() => openRepo(repo.id)}>
                  <ExternalLink />
                  Open
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() =>
                    navigate({
                      to: "/dashboard/settings/repos/$repoId/visibility",
                      params: { repoId: repo.id },
                    })
                  }
                >
                  <Settings />
                  Settings
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() =>
                    setRepoSidebarVisibility(user?.id ?? "", repo.id, false)
                  }
                >
                  Hide from sidebar
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
      {canCreateRepo && (
        <AddRepoDialog
          onOpenChange={setAddRepoOpen}
          open={addRepoOpen}
          organizationId={organization.id}
        />
      )}
    </SidebarGroup>
  );
}
