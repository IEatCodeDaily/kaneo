import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  ListChecks,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import InboxUnreadBadge from "@/components/inbox-unread-badge";
import MyTasksCountBadge from "@/components/my-tasks-count-badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
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
import { useUserPreferencesStore } from "@/store/user-preferences";

function relativeTime(openedAt?: number) {
  if (!openedAt) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NavMain() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [recentOpen, setRecentOpen] = useState(false);
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
    <SidebarGroup className="p-2 pb-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {primary.map(({ label, icon: Icon, url, badge }) => (
            <SidebarMenuItem key={url}>
              <SidebarMenuButton
                className="h-7 text-xs"
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
          {recentPages.length > 0 && (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    aria-expanded={recentOpen}
                    aria-label={t("navigation:sidebar.recent")}
                    className="h-7 text-xs"
                    onClick={() => setRecentOpen((open) => !open)}
                  >
                    <Clock3 />
                    <span className="flex-1">
                      {t("navigation:sidebar.recent")}
                    </span>
                    <span className="w-5 text-right text-[10px] tabular-nums">
                      {Math.min(recentPages.length, recentPageLimit)}
                    </span>
                    <span
                      className="flex w-5 justify-center"
                      data-testid="recent-chevron-column"
                    >
                      {recentOpen ? <ChevronDown /> : <ChevronRight />}
                    </span>
                  </SidebarMenuButton>
                  {recentOpen && (
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
                              className="h-6 text-[11px]"
                              onClick={() => navigate({ to: page.pathname })}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {page.label}
                              </span>
                              <span className="text-muted-foreground">
                                {relativeTime(page.openedAt)}
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuRadioGroup
                  value={String(recentPageLimit)}
                  onValueChange={(value) => setRecentPageLimit(Number(value))}
                >
                  {[3, 4, 5, 6, 7, 8].map((limit) => (
                    <ContextMenuRadioItem key={limit} value={String(limit)}>
                      {limit}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuContent>
            </ContextMenu>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
