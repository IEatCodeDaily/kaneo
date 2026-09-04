import { ChevronDown, ChevronRight, FolderKanban } from "lucide-react";
import { useState } from "react";
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
  const [projectsOpen, setProjectsOpen] = useState(true);
  if (!organization) return null;

  return (
    <>
      <SidebarGroup className="p-2 pb-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-expanded={projectsOpen}
                className="h-7 text-xs"
                onClick={() => setProjectsOpen((open) => !open)}
                tooltip="Projects"
              >
                <FolderKanban />
                <span className="flex-1">Projects</span>
                <span className="w-5" />
                <span className="flex w-5 justify-center">
                  {projectsOpen ? <ChevronDown /> : <ChevronRight />}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {projectsOpen && <NavProjects />}
    </>
  );
}
