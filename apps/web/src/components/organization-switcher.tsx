import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import NotificationDropdown from "@/components/notification/notification-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizations from "@/hooks/queries/organization/use-get-organizations";
import {
  getModifierKeyText,
  useRegisterShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import { authClient } from "@/lib/auth-client";
import type { Organization } from "@/types/organization";
import CreateOrganizationModal from "./shared/modals/create-organization-modal";

export function OrganizationSwitcher() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();

  // User-scoped WebSocket for real-time events (e.g. NOTIFICATION_CREATED)
  useUserWebSocket();
  const { data: organizations } = useGetOrganizations();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCreateOrganizationModalOpen, setIsCreateOrganizationModalOpen] =
    React.useState(false);
  const [isSwitching, setIsSwitching] = React.useState(false);

  const handleOrganizationChange = React.useCallback(
    async (selectedOrganization: Organization) => {
      if (isSwitching) return;

      setIsSwitching(true);
      try {
        await authClient.organization.setActive({
          organizationId: selectedOrganization.id,
        });

        setTimeout(() => {
          navigate({
            to: "/dashboard/organization/$organizationId",
            params: { organizationId: selectedOrganization.id },
          });
        }, 50);
      } catch (error) {
        console.error("Failed to switch organization:", error);
      } finally {
        setTimeout(() => setIsSwitching(false), 100);
      }
    },
    [navigate, isSwitching],
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!organizations || organizations.length === 0) return;

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key >= "1" &&
        event.key <= "9"
      ) {
        event.preventDefault();
        const index = Number.parseInt(event.key, 10) - 1;
        if (index < organizations.length) {
          handleOrganizationChange(organizations[index]);
          setIsOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, organizations, handleOrganizationChange]);

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.switch]: () => {
          setIsOpen(true);
        },
        [shortcuts.organization.create]: () => {
          setIsCreateOrganizationModalOpen(true);
        },
      },
    },
  });

  if (!organization) {
    return null;
  }

  return (
    <>
      <div className="flex items-center justify-between w-full gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="group h-8 w-full rounded-md px-2 text-sidebar-foreground data-[active=true]:bg-sidebar-accent/50"
                    size="default"
                  />
                }
              >
                <div className="flex items-center min-w-0 w-full">
                  <span
                    className={`truncate text-sm font-medium text-foreground ${isSwitching ? "opacity-50" : ""}`}
                  >
                    {organization.name}
                  </span>
                </div>
                <ChevronDown
                  className={`ml-1 size-3.5 text-foreground/70 opacity-90 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:rotate-180 transition-[rotate,opacity] duration-200 ease-out ${isSwitching ? "animate-spin" : ""}`}
                  data-state={isOpen ? "open" : "closed"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-(--anchor-width) text-sidebar-foreground"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {t("navigation:organizationSwitcher.organizations")}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                {organizations?.map((ws: Organization, index: number) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => {
                      if (!isSwitching && ws.id !== organization.id) {
                        handleOrganizationChange(ws);
                        setIsOpen(false);
                      }
                    }}
                    disabled={isSwitching || ws.id === organization.id}
                    className="h-7 text-sm data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground"
                  >
                    <span className="flex-1 text-left">
                      {isSwitching && ws.id === organization?.id
                        ? t("navigation:organizationSwitcher.switching")
                        : ws.name}
                    </span>
                    <DropdownMenuShortcut>
                      {getModifierKeyText()} {index > 8 ? "0" : index + 1}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setIsCreateOrganizationModalOpen(true);
                    setIsOpen(false);
                  }}
                  className="h-7 text-sm data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground"
                >
                  <span>{t("navigation:organizationSwitcher.addOrganization")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="flex items-center gap-1">
          <NotificationDropdown />
          <div className="h-8 w-8 shrink-0">
            <UserAvatar />
          </div>
        </div>
      </div>

      <CreateOrganizationModal
        open={isCreateOrganizationModalOpen}
        onClose={() => setIsCreateOrganizationModalOpen(false)}
      />
    </>
  );
}
