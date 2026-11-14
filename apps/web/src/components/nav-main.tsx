import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  House,
  Inbox,
  ListChecks,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import InboxUnreadBadge from "@/components/inbox-unread-badge";
import MyTasksCountBadge from "@/components/my-tasks-count-badge";
import { RecentPagesDialog } from "@/components/recent-pages-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
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
import { recentRelativeTime } from "@/lib/recent-page";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function NavMain() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const recentOpen = useUserPreferencesStore((state) => state.recentOpen);
  const setRecentOpen = useUserPreferencesStore((state) => state.setRecentOpen);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const recentPages = useUserPreferencesStore((state) => state.recentPages);
  const recentPageLimit = useUserPreferencesStore(
    (state) => state.recentPageLimit,
  );
  const setRecentPageLimit = useUserPreferencesStore(
    (state) => state.setRecentPageLimit,
  );
  if (!organization) return null;
  const inboxUrl = `/dashboard/organization/${organization.slug}/inbox`;
  const ticketsUrl = `/dashboard/organization/${organization.slug}/my-tasks`;
  const primary = [
    {
      label: t("home:title"),
      icon: House,
      url: `/dashboard/organization/${organization.slug}/home`,
      badge: null,
    },
    {
      label: t("navigation:sidebar.inbox"),
      icon: Inbox,
      url: inboxUrl,
      badge: <InboxUnreadBadge />,
    },
    {
      label: t("navigation:sidebar.myTasks"),
      icon: ListChecks,
      url: ticketsUrl,
      badge: <MyTasksCountBadge organizationId={organization.id} />,
    },
  ];
  return (
    <SidebarGroup className="px-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0">
          {primary.map(({ label, icon: Icon, url, badge }) => (
            <SidebarMenuItem key={url}>
              <SidebarMenuButton
                className="h-6 text-xs"
                isActive={pathname === url}
                onClick={() => navigate({ to: url })}
                tooltip={label}
              >
                <Icon />
                <span className="flex-1">{label}</span>
                <span
                  className="w-5"
                  data-testid={
                    url === inboxUrl ? "inbox-count-column" : undefined
                  }
                >
                  {badge}
                </span>
                <span className="w-5" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <SidebarMenuItem>
                <SidebarMenuButton
                  aria-expanded={recentOpen}
                  aria-label={t("navigation:sidebar.recent")}
                  className="h-6 text-xs"
                  onClick={() => setRecentOpen(!recentOpen)}
                >
                  <Clock3 />
                  <span className="flex-1">
                    {t("navigation:sidebar.recent")}
                  </span>
                  <span className="w-5 text-right text-xs tabular-nums">
                    {recentPages.length > 0
                      ? Math.min(recentPages.length, recentPageLimit)
                      : null}
                  </span>
                  <span
                    className="flex w-5 justify-center"
                    data-testid="recent-chevron-column"
                  >
                    {recentOpen ? <ChevronDown /> : <ChevronRight />}
                  </span>
                </SidebarMenuButton>
                {recentOpen &&
                  (recentPages.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">                      {t("navigation:sidebar.recentEmpty")}
                    </p>
                  ) : (
                    <SidebarMenuSub>
                      {recentPages
                        .slice(0, recentPageLimit)
                        .map((page, index) => (
                          <SidebarMenuSubItem
                            className={
                              index >= 3
                                ? "hidden min-[900px]:block"
                                : undefined
                            }
                            key={page.pathname}
                          >
                            <SidebarMenuSubButton
                              className="h-6 text-xs"
                              onClick={() => navigate({ to: page.pathname })}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {page.label}
                              </span>
                              {page.detail ? (
                                <span className="max-w-20 shrink-0 truncate rounded bg-muted px-1 text-xs text-muted-foreground">
                                  {page.detail}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground">
                                {recentRelativeTime(page.openedAt)}
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                  ))}
              </SidebarMenuItem>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuGroup>
                <ContextMenuLabel>
                  {t("navigation:sidebar.recentShowLatest")}
                </ContextMenuLabel>
                <ContextMenuRadioGroup
                  value={String(recentPageLimit)}
                  onValueChange={(value) => setRecentPageLimit(Number(value))}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((limit) => (
                    <ContextMenuRadioItem key={limit} value={String(limit)}>
                      {limit}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuGroup>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setViewAllOpen(true)}>
                {t("navigation:sidebar.recentViewAll")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <RecentPagesDialog open={viewAllOpen} onOpenChange={setViewAllOpen} />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
