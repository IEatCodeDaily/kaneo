import { useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, Library, Settings, Users,} from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { SidebarResizeHandle } from "@/components/common/sidebar-resize-handle";
import { NavBoards } from "@/components/nav-boards";
import { NavMain } from "@/components/nav-main";
import { NavRepos } from "@/components/nav-repos";
import { NavTables } from "@/components/nav-tables";
import { NavWork } from "@/components/nav-work";
import { OrganizationMenuSection } from "@/components/organization-switcher";
import CreateOrganizationModal from "@/components/shared/modals/create-organization-modal";
import { TeamViewSelector } from "@/components/team-view-selector";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { VersionDisplay } from "@/components/version-display";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useRememberCurrentView } from "@/hooks/use-remembered-view";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import { cn } from "@/lib/cn";
import Search from "./search";

function ResourceNavigation() {
  return (
    <>
      <NavBoards />
      <NavRepos />
      <NavTables />
    </>
  );
}
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar, state } = useSidebar();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"work" | "resources">("work");
  const [createOpen, setCreateOpen] = useState(false);
  const [organizationMenuOpen, setOrganizationMenuOpen] = useState(false);
  const isCollapsed = state === "collapsed";
  const workEnabled = Boolean(
    (
      organization as
        | (typeof organization & { workEnabled?: boolean })
        | undefined
    )?.workEnabled,
  );
  const initials =
    organization?.name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part[0])
      .join("")
      .toUpperCase() || "OR";
  const modeStorageKey = organization
    ? `kaneo:sidebar-mode:${organization.id}`
    : null;
  useEffect(() => {
    if (!modeStorageKey) return;
    const saved = sessionStorage.getItem(modeStorageKey);
    setMode(saved === "resources" ? "resources" : "work");
  }, [modeStorageKey]);
  const selectMode = (nextMode: "work" | "resources") => {
    setMode(nextMode);
    if (modeStorageKey) sessionStorage.setItem(modeStorageKey, nextMode);
  };
  useRememberCurrentView();
  useUserWebSocket();
  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.switch]: () => setOrganizationMenuOpen(true),
      },
    },
    modifierShortcuts: {
      [shortcuts.sidebar.prefix]: { [shortcuts.sidebar.toggle]: toggleSidebar },
    },
  });
  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="border-none pt-1.5"
      {...props}
    >
      <SidebarHeader className="pt-1 pb-1.5">
        <div
          className="flex w-full flex-row items-center gap-1"
          data-testid="sidebar-header"
        >
          {/* #96: the top is team scope + collapse only; the organization
              lives at the bottom with the account. */}
          {!isCollapsed && <TeamViewSelector />}
          <SidebarTrigger
            className={cn("shrink-0", !isCollapsed && "ml-auto")}
            data-testid="sidebar-toggle"
          />
        </div>
      </SidebarHeader>
      {/*
        better-layout: groups must be separated by more than the rhythm
        inside them. Rows sit on gap-0.5 (2px) and menus on gap-1 (4px),
        so the group rail needs gap-3 (12px) for the grouping to read as
        structure instead of noise.
      */}
      <SidebarContent className="gap-3 overflow-y-auto py-1">
        <Search />
        <NavMain />
        {workEnabled && (
          <div className="mx-2 grid grid-cols-2 rounded-md bg-sidebar-accent p-0.5 text-xs">
            <button
              type="button"
              className="flex h-7 items-center justify-center gap-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
              data-active={mode === "work"}
              onClick={() => selectMode("work")}
            >
              <BriefcaseBusiness className="size-4" />
              Work
            </button>
            <button
              type="button"
              className="flex h-7 items-center justify-center gap-1.5 rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
              data-active={mode === "resources"}
              onClick={() => selectMode("resources")}
            >
              <Library className="size-4" />
              Resources
            </button>
          </div>
        )}
        {workEnabled && mode === "work" ? <NavWork /> : <ResourceNavigation />}
      </SidebarContent>
      <SidebarFooter>
        <button
          type="button"
          aria-label="Members"
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-xs outline-hidden ring-sidebar-ring transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 sm:min-h-8"
          onClick={() =>
            organization &&
            navigate({
              to: `/dashboard/organization/${organization.slug}/members`,
            })
          }
        >
          <Users className="size-4" />
          {!isCollapsed && <span>Members</span>}
        </button>
        <button
          type="button"
          aria-label="Settings"
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-xs outline-hidden ring-sidebar-ring transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 sm:min-h-8"
          onClick={() =>
            navigate({ to: "/dashboard/settings/account/information" })
          }
        >
          <Settings className="size-4" />
          <span>Settings</span>
        </button>
        <div className="flex items-center gap-2" data-testid="sidebar-footer">
          <DropdownMenu
            open={organizationMenuOpen}
            onOpenChange={setOrganizationMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="sidebar-organization-identity"
                aria-expanded={organizationMenuOpen}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Avatar className="size-7 rounded-md">
                  {/* An empty src renders a broken-image blob in dark mode;
                      fall straight to initials when no logo is set. */}
                  {organization?.logo ? (
                    <AvatarImage
                      src={organization.logo}
                      alt={organization?.name ?? ""}
                    />
                  ) : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {organization?.name}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-64">
              <OrganizationMenuSection
                onCreateOrganization={() => setCreateOpen(true)}
              />
              <VersionDisplay />
            </DropdownMenuContent>
          </DropdownMenu>
          {!isCollapsed && <UserAvatar />}
        </div>
      </SidebarFooter>
      <CreateOrganizationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <SidebarResizeHandle />
    </Sidebar>
  );
}
