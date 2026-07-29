import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

/**
 * Top-level organization navigation.
 *
 * Previously this was a collapsible "Overview" group containing Boards,
 * Members, Repos and Invitations. Boards and Repos now own their own sidebar
 * sections (whose headers navigate to the same overviews), and Invitations is
 * account-scoped so it moved to the profile dropdown. That left a collapsible
 * group wrapping a single item, so the group itself is gone and Members is
 * rendered directly.
 */
export function NavMain() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (!organization && user?.role !== "admin") return null;
  if (!organization) return null;

  const membersUrl = `/dashboard/organization/${organization.id}/members`;

  return (
    <SidebarGroup className="gap-1 p-2 pb-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-8 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
              isActive={location.pathname === membersUrl}
              onClick={() => navigate({ to: membersUrl })}
              size="default"
              tooltip={t("navigation:sidebar.members")}
            >
              <span>{t("navigation:sidebar.members")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
