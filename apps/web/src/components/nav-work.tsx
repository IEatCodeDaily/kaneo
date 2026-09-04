import { BarChart3, Eye, Goal } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  if (!organization) return null;
  const placeholders = [
    { label: "Initiatives", icon: Goal },
    { label: "Digest", icon: BarChart3 },
    { label: "Views", icon: Eye },
  ];
  return (
    <>
      {/*
        better-layout: the Work group needs more space above it than the
        0.5-step rhythm between its own rows, otherwise the grouping reads
        as noise rather than structure.
      */}
      <SidebarGroup className="p-2 pt-2 pb-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {placeholders.map(({ label, icon: Icon }) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  aria-disabled="true"
                  className="h-7 text-xs opacity-60"
                  tooltip={`${label} — ${t("navigation:sidebar.comingSoon")}`}
                >
                  {/*
                    better-ui: 1.5px stroke matches regular-weight 12px text;
                    the default 2px reads heavier than the label beside it.
                  */}
                  <Icon strokeWidth={1.5} />
                  <span className="flex-1">{label}</span>
                  {/*
                    better-accessibility: unavailability must not be carried
                    by opacity alone. This badge is the redundant cue.
                  */}
                  <span className="rounded-sm bg-sidebar-accent px-1 text-[9px] text-sidebar-accent-foreground uppercase tracking-wide">
                    {t("navigation:sidebar.soon")}
                  </span>
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
