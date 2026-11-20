import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Database,
  FolderKanban,
  Github,
  LayoutDashboard,
  Library,
  RefreshCw,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { FeatureStageBadge } from "@/components/feature-stage-badge";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetProjectSidebar from "@/hooks/queries/project/use-get-project-sidebar";
import {
  SIDEBAR_ACTIVE_PILL,
  SIDEBAR_ROUTES,
  useSidebarActive,
} from "@/hooks/use-sidebar-active";
import { useUserPreferencesStore } from "@/store/user-preferences";

type Resource = {
  id: string;
  resourceType: "board" | "repo" | "table";
  resourceId: string;
  resource: {
    id: string;
    slug?: string;
    owner?: string;
    name: string;
    icon?: string | null;
  };
};
type Project = {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  progress: { percent: number | null };
  leadTeam: { id: string; name: string } | null;
  resources: Resource[];
};

export function NavProjects() {
  const { user } = useAuth();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const { isActive } = useSidebarActive();
  const { data = [] } = useGetProjectSidebar(organization?.id ?? "");
  const { hiddenProjectIds, setProjectSidebarVisibility } =
    useUserPreferencesStore();
  const storageKey = organization
    ? `kaneo:project-sidebar:${organization.id}`
    : null;
  const [expanded, setExpanded] = useState<string[]>([]);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(
    null,
  );

  // The active organization is loaded asynchronously. Hydrate only after its
  // real ID exists; otherwise the first render reads `kaneo:project-sidebar:`
  // and never restores the organization's saved disclosure state.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      setExpanded(Array.isArray(stored) ? stored : []);
    } catch {
      setExpanded([]);
    }
    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    const active = (data as Project[]).find((project) =>
      isActive(SIDEBAR_ROUTES.project, {
        organizationSlug: organization?.slug ?? "",
        projectSlug: project.slug,
      }),
    );
    if (active)
      setExpanded((current) =>
        current.includes(active.id) ? current : [...current, active.id],
      );
  }, [data, organization?.slug, isActive]);
  useEffect(() => {
    if (storageKey && hydratedStorageKey === storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(expanded));
    }
  }, [expanded, hydratedStorageKey, storageKey]);
  if (!organization) return null;
  const toggle = (id: string) =>
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const go = (resource: Resource) => {
    if (resource.resourceType === "board")
      navigate({
        to: "/dashboard/organization/$organizationSlug/board/$boardSlug",
        params: {
          organizationSlug: organization.slug,
          boardSlug: resource.resource.slug ?? resource.resourceId,
        },
      });
    else if (resource.resourceType === "repo")
      navigate({
        to: "/dashboard/organization/$organizationSlug/repo/$repoId/code",
        params: {
          organizationSlug: organization.slug,
          repoId: resource.resource.slug ?? resource.resourceId,
        },
        search: { path: "" },
      });
    else
      navigate({
        to: "/dashboard/organization/$organizationSlug/table/$tableId",
        params: {
          organizationSlug: organization.slug,
          tableId: resource.resource.slug ?? resource.resourceId,
        },
      });
  };
  const hiddenProjects = (data as Project[]).filter((project) =>
    hiddenProjectIds.includes(`${user?.id}:${project.id}`),
  );
  const visibleProjects = (data as Project[]).filter(
    (project) => !hiddenProjectIds.includes(`${user?.id}:${project.id}`),
  );
  const orgParams = { organizationSlug: organization.slug };
  const isProjectActive = (project: Pick<Project, "slug">) =>
    isActive(SIDEBAR_ROUTES.project, {
      ...orgParams,
      projectSlug: project.slug,
    });
  // Resource rows point at board/repo/table routes; match those routes with
  // the same patterns the resource sections use (pathname.includes() produced
  // phantom highlights for slugs like "api" inside "/rapid/…").
  const isResourceActive = (item: Resource) => {
    if (item.resourceType === "board")
      return isActive(SIDEBAR_ROUTES.board, {
        ...orgParams,
        boardSlug: item.resource.slug ?? item.resourceId,
      });
    if (item.resourceType === "repo")
      return isActive(SIDEBAR_ROUTES.repo, {
        ...orgParams,
        repoId: item.resourceId,
      });
    return isActive(SIDEBAR_ROUTES.table, {
      ...orgParams,
      tableId: item.resourceId,
    });
  };
  const projectsSectionActive = isActive(SIDEBAR_ROUTES.projects, orgParams);
  // The Projects overview row doubles as the section header: exact on
  // /projects itself, plus the fallback when the route belongs to a project
  // (or one of its resources) that is hidden, collapsed, or not yet loaded.
  const projectsHeaderActive =
    isActive(SIDEBAR_ROUTES.projects, orgParams, { exact: true }) ||
    (projectsSectionActive &&
      !visibleProjects.some(
        (project) =>
          isProjectActive(project) ||
          project.resources.some((item) => isResourceActive(item)),
      ));
  const resourceGroups = [
    { type: "board", label: "Boards", icon: LayoutDashboard },
    { type: "repo", label: "Repos", icon: Github },
    { type: "table", label: "Tables", icon: Database },
  ] as const;
  return (
    <SidebarGroup className="gap-1 p-2 pb-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              className={`h-7 gap-2 text-xs ${SIDEBAR_ACTIVE_PILL}`}
              isActive={projectsHeaderActive}
              onClick={() =>
                navigate({
                  to: "/dashboard/organization/$organizationSlug/projects",
                  params: { organizationSlug: organization.slug },
                })
              }
              tooltip="Projects"
            >
              <span className="flex-1">Projects</span>
              <FeatureStageBadge stage="Alpha" />
              <ChevronRight className="size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          {visibleProjects.map((project) => {
            const open = expanded.includes(project.id);
            const resourcesId = `${project.id}:resources`;
            const resourcesOpen = expanded.includes(resourcesId);
            return (
              <ContextMenu key={project.id}>
                <ContextMenuTrigger asChild>
                  <SidebarMenuItem key={project.id}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${project.name}`}
                        className="size-7 shrink-0 cursor-pointer rounded-md text-sidebar-foreground outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        onClick={() => toggle(project.id)}
                      >
                        {open ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <SidebarMenuButton
                        className={`h-7 text-xs ${SIDEBAR_ACTIVE_PILL}`}
                        isActive={isProjectActive(project)}
                        tooltip={project.name}
                        onClick={() =>
                          navigate({
                            to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
                            params: {
                              organizationSlug: organization.slug,
                              projectSlug: project.slug,
                            },
                          })
                        }
                      >
                        <span
                          className="size-2 rounded-sm"
                          style={{
                            backgroundColor: project.color ?? "currentColor",
                          }}
                        />
                        <span className="flex-1">{project.name}</span>
                        <span className="w-5 text-xs text-muted-foreground">
                          {project.progress.percent !== null
                            ? `${project.progress.percent}%`
                            : ""}
                        </span>
                        <span className="w-5" />
                      </SidebarMenuButton>
                    </div>
                    {open && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className={SIDEBAR_ACTIVE_PILL}
                            isActive={isActive(
                              SIDEBAR_ROUTES.project,
                              { ...orgParams, projectSlug: project.slug },
                              { exact: true },
                            )}
                            onClick={() =>
                              navigate({
                                to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
                                params: {
                                  organizationSlug: organization.slug,
                                  projectSlug: project.slug,
                                },
                              })
                            }
                          >
                            <FolderKanban className="size-4" />
                            <span>Overview</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            aria-disabled="true"
                            aria-label="Project Boards"
                          >
                            <LayoutDashboard className="size-4" />
                            <span>Boards</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            aria-disabled="true"
                            aria-label="Project Cycles"
                          >
                            <RefreshCw className="size-4" />
                            <span>Cycles</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            aria-expanded={resourcesOpen}
                            onClick={() => toggle(resourcesId)}
                          >
                            <Library className="size-4" />
                            <span className="flex-1">Resources</span>
                            <span className="w-5" />
                            {resourcesOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        {resourcesOpen &&
                          resourceGroups.map(({ type, label, icon: Icon }) => {
                            const resourceTypeId = `${resourcesId}:${type}`;
                            const resourceTypeOpen =
                              expanded.includes(resourceTypeId);
                            const resources = project.resources.filter(
                              (item) => item.resourceType === type,
                            );
                            return (
                              <Fragment key={type}>
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton
                                    aria-label={label}
                                    aria-expanded={resourceTypeOpen}
                                    onClick={() => toggle(resourceTypeId)}
                                  >
                                    <Icon className="size-4" />
                                    <span className="flex-1">{label}</span>
                                    <span className="w-5 text-xs text-muted-foreground">
                                      {resources.length || ""}
                                    </span>
                                    {resourceTypeOpen ? (
                                      <ChevronDown className="size-4" />
                                    ) : (
                                      <ChevronRight className="size-4" />
                                    )}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                {resourceTypeOpen &&
                                  resources.map((item) => (
                                    <SidebarMenuSubItem key={item.id}>
                                      <SidebarMenuSubButton
                                        className={SIDEBAR_ACTIVE_PILL}
                                        isActive={isResourceActive(item)}
                                        onClick={() => go(item)}
                                      >
                                        <span>{item.resource.name}</span>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  ))}
                              </Fragment>
                            );
                          })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem
                    onClick={() =>
                      setProjectSidebarVisibility(
                        user?.id ?? "",
                        project.id,
                        false,
                      )
                    }
                  >
                    Hide from sidebar
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {hiddenProjects.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="More Projects">
                <span className="flex-1">More Projects</span>
                <span className="w-5 text-xs text-muted-foreground">
                  {hiddenProjects.length}
                </span>
              </SidebarMenuButton>
              <SidebarMenuSub>
                {hiddenProjects.map((project) => (
                  <SidebarMenuSubItem key={project.id}>
                    <SidebarMenuSubButton
                      onClick={() =>
                        setProjectSidebarVisibility(
                          user?.id ?? "",
                          project.id,
                          true,
                        )
                      }
                    >
                      {project.name}
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
export default NavProjects;
