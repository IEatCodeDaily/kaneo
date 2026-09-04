import { BarChart3, Eye, FolderKanban, Goal } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
      <SidebarGroup className="gap-1 p-2 pb-0">
        <SidebarGroupLabel className="flex h-7 items-center gap-2 px-2 text-xs normal-case text-foreground">
          <FolderKanban className="size-4" />
          <span className="flex-1">Projects</span>
          <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[9px] font-medium uppercase">
            Alpha
          </span>
        </SidebarGroupLabel>
        <NavProjects />
      </SidebarGroup>
    </>
  );
}
