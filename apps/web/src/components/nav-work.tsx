import { BarChart3, Eye, Goal } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { NavProjects } from "./nav-projects";

export function NavWork() {
  const { data: organization } = useActiveOrganization();
  if (!organization) return null;
  const placeholders = [
    { label: "Initiatives", icon: Goal },
    { label: "Digest", icon: BarChart3 },
    { label: "Views", icon: Eye },
  ];
  return (
    <>
      <SidebarGroup className="p-2 pb-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {placeholders.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  aria-disabled="true"
                  className="h-7 text-xs opacity-50"
                  tooltip={`${label} — coming soon`}
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <NavProjects />
    </>
  );
}
