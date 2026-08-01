import type * as React from "react";
import { NavBoards } from "@/components/nav-boards";
import { NavMain } from "@/components/nav-main";
import { NavRepos } from "@/components/nav-repos";
import { TeamViewSelector } from "@/components/team-view-selector";
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
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useRememberCurrentView } from "@/hooks/use-remembered-view";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import Search from "./search";

/**
 * #96 sidebar shape:
 *
 *   Team selector | Sidebar toggle   <- header
 *   Inbox / My Tasks / Members
 *   Boards, Repos
 *   version | Avatar                 <- footer
 *
 * The organization selector and theme toggle moved into the avatar popup at
 * the bottom; the notification bell is gone entirely because it duplicated
 * Inbox. The version number is a discreet marker in the bottom-left corner.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar } = useSidebar();

  // Remember the board/repo view the user is in, for the next time they
  // come back to a board or repo.
  useRememberCurrentView();

  // User-scoped WebSocket for real-time events. This used to be mounted by the
  // organization switcher, which no longer renders in the sidebar.
  useUserWebSocket();

  useRegisterShortcuts({
    modifierShortcuts: {
      [shortcuts.sidebar.prefix]: {
        [shortcuts.sidebar.toggle]: toggleSidebar,
      },
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
          className="flex w-full items-center gap-1"
          data-testid="sidebar-header"
        >
          <TeamViewSelector />
          <SidebarTrigger
            className="ml-auto shrink-0"
            data-testid="sidebar-toggle"
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="overflow-hidden gap-1 py-1">
        <Search />
        <NavMain />
        <NavBoards />
        <NavRepos />
      </SidebarContent>
      <SidebarFooter data-testid="sidebar-footer">
        <div className="flex items-center justify-between gap-2">
          <VersionDisplay />
          <div className="h-8 w-8 shrink-0">
            <UserAvatar />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
