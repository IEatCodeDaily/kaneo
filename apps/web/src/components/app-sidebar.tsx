import { useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, Library, Settings, Users } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { SidebarResizeHandle } from "@/components/common/sidebar-resize-handle";
import { NavBoards } from "@/components/nav-boards";
import { NavDashboards } from "@/components/nav-dashboards";
import { NavMain } from "@/components/nav-main";
import { NavRepos } from "@/components/nav-repos";
import { NavTables } from "@/components/nav-tables";
import { NavWork } from "@/components/nav-work";
import CreateOrganizationModal from "@/components/shared/modals/create-organization-modal";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { OrgTeamSelector } from "@/components/org-team-selector";
import { UserAvatar } from "@/components/user-avatar";
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
      <NavDashboards />
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
          <OrgTeamSelector
            open={organizationMenuOpen}
            onOpenChange={setOrganizationMenuOpen}
            onAddOrganization={() => setCreateOpen(true)}
          />
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
        structure instead of noise. The pinned cluster (search + primary
        nav) is one unit: proximity beats sectioning for a toolbar, so it
        uses intra-group spacing internally and the rail only separates it
        from the real sections below.
      */}
      <SidebarContent className="gap-3 overflow-y-auto py-1">
        {/* Search is a toolbar for the pinned cluster, not a peer section:
            it shares NavMain's intra-group spacing; the rail gap still
            separates this cluster from Boards/Repos/Tables below. */}
        {/* Pinned cluster: search + primary nav stay fixed while the
            resource sections scroll under them. bg-sidebar hides rows
            scrolling past beneath the sticky block. */}
        <div className="sticky top-0 z-10 flex flex-col bg-sidebar pb-1">
          <Search />
          <NavMain />
        </div>
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
      {/* Tighter footer: the two identity actions sit close together. */}
      <SidebarFooter className="gap-0 px-1 pb-1">
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
        <div className="flex items-center gap-1" data-testid="sidebar-footer">
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
