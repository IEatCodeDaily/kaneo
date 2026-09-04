import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Database,
  FolderKanban,
  Github,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetProjectSidebar from "@/hooks/queries/project/use-get-project-sidebar";

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
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data = [] } = useGetProjectSidebar(organization?.id ?? "");
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
      pathname.startsWith(
        `/dashboard/organization/${organization?.slug}/projects/${project.slug}`,
      ),
    );
    if (active)
      setExpanded((current) =>
        current.includes(active.id) ? current : [...current, active.id],
      );
  }, [data, organization?.slug, pathname]);
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
          repoId: resource.resourceId,
        },
        search: { path: "" },
      });
    else
      navigate({
        to: "/dashboard/organization/$organizationSlug/table/$tableId",
        params: {
          organizationSlug: organization.slug,
          tableId: resource.resourceId,
        },
      });
  };
  const resourceGroups = [
    { type: "board", label: "Boards", icon: LayoutDashboard },
    { type: "repo", label: "Repos", icon: Github },
    { type: "table", label: "Tables", icon: Database },
  ] as const;
  return (
    <SidebarGroup className="gap-1 p-2 pb-0">
      <SidebarGroupLabel className="sr-only">
        {t("navigation:sidebar.projects")}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {(data as Project[]).map((project) => {
            const open = expanded.includes(project.id);
            const resourcesId = `${project.id}:resources`;
            const resourcesOpen = expanded.includes(resourcesId);
            return (
              <SidebarMenuItem key={project.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${project.name}`}
                    className="size-7 shrink-0"
                    onClick={() => toggle(project.id)}
                  >
                    {open ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                  <SidebarMenuButton
                    className="h-7 text-xs"
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
                        <Github className="size-4" />
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
                                    isActive={
                                      pathname.includes(item.resourceId) ||
                                      (!!item.resource.slug &&
                                        pathname.includes(item.resource.slug))
                                    }
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
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
export default NavProjects;
