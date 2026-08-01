import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/menu";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizations from "@/hooks/queries/organization/use-get-organizations";
import {
  getModifierKeyText,
  useRegisterShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";
import type { Organization } from "@/types/organization";
import CreateOrganizationModal from "./shared/modals/create-organization-modal";

/**
 * #96: the organization selector no longer lives at the top of the sidebar —
 * the top is now the team-view selector. The organization list is rendered as
 * a section inside the user avatar popup menu at the bottom of the sidebar,
 * which is what this component provides.
 */
export function OrganizationMenuSection() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { data: organizations } = useGetOrganizations();
  const navigate = useNavigate();
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

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.create]: () => {
          setIsCreateOrganizationModalOpen(true);
        },
      },
    },
  });

  return (
    <div data-testid="organization-selector">
      <DropdownMenuLabel>
        {t("navigation:organizationSwitcher.organizations")}
      </DropdownMenuLabel>
      {organizations?.map((ws: Organization, index: number) => (
        <DropdownMenuItem
          className="h-7 text-sm"
          disabled={isSwitching || ws.id === organization?.id}
          key={ws.id}
          onClick={() => {
            if (!isSwitching && ws.id !== organization?.id) {
              handleOrganizationChange(ws);
            }
          }}
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
      <DropdownMenuItem
        className="h-7 text-sm"
        onClick={() => setIsCreateOrganizationModalOpen(true)}
      >
        <span>{t("navigation:organizationSwitcher.addOrganization")}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />

      <CreateOrganizationModal
        onClose={() => setIsCreateOrganizationModalOpen(false)}
        open={isCreateOrganizationModalOpen}
      />
    </div>
  );
}

export default OrganizationMenuSection;
