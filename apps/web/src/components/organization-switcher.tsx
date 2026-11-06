import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/menu";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizations from "@/hooks/queries/organization/use-get-organizations";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { useTeamViewStore } from "@/store/team-view";
import type { Organization } from "@/types/organization";

/**
 * Organization actions and switching live in the sidebar identity menu.
 * Team-view scope stays separate so switching identity does not replace it.
 */
export function OrganizationMenuSection({
  onCreateOrganization,
}: {
  onCreateOrganization: () => void;
}) {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { data: organizations } = useGetOrganizations();
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const pending = React.useRef(false);
  const isSwitching = switchingId !== null;

  const handleOrganizationChange = React.useCallback(
    async (selectedOrganization: Organization) => {
      if (pending.current || selectedOrganization.id === organization?.id)
        return;
      pending.current = true;
      setSwitchingId(selectedOrganization.id);
      try {
        const result = await authClient.organization.setActive({
          organizationId: selectedOrganization.id,
        });
        if (result.error) throw new Error(result.error.message);
        useTeamViewStore.getState().setTeamView(null, null);
        const page = pathname.endsWith("/my-tasks")
          ? "my-tasks"
          : pathname.endsWith("/inbox")
            ? "inbox"
            : "home";
        await navigate({
          to: `/dashboard/organization/$organizationSlug/${page}`,
          params: { organizationSlug: selectedOrganization.slug },
        });
        await queryClient.invalidateQueries();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("navigation:organizationSwitcher.switchError", {
                defaultValue: "Could not switch organization",
              }),
        );
        console.error("Failed to switch organization:", error);
      } finally {
        pending.current = false;
        setSwitchingId(null);
      }
    },
    [navigate, organization?.id, pathname, queryClient, t],
  );

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.organization.prefix]: {
        ...Object.fromEntries(
          (organizations ?? []).slice(0, 9).map((item, index) => [
            String(index + 1),
            () => {
              void handleOrganizationChange(item);
            },
          ]),
        ),
        [shortcuts.organization.create]: () => {
          onCreateOrganization();
        },
      },
    },
  });

  return (
    <div data-testid="organization-selector">
      <DropdownMenuGroup>
        <DropdownMenuItem
          className="min-h-11 sm:min-h-9"
          onClick={() =>
            navigate({ to: "/dashboard/settings/organization/members" })
          }
        >
          {t("team:members.pageTitle")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 sm:min-h-9"
          onClick={() =>
            navigate({ to: "/dashboard/settings/organization/general" })
          }
        >
          {t("navigation:page.settingsTitle")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {/* Base UI's MenuGroupLabel requires MenuGroup context. Rendering this
          label directly caused production error #31 whenever the profile menu
          opened; mocked unit primitives hid the invalid tree. */}
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          {t("navigation:organizationSwitcher.organizations")}
        </DropdownMenuLabel>
        {organizations?.map((ws: Organization, index: number) => (
          <DropdownMenuItem
            className="min-h-11 gap-3 text-sm sm:min-h-9"
            disabled={isSwitching || ws.id === organization?.id}
            key={ws.id}
            onClick={() => {
              if (!isSwitching && ws.id !== organization?.id) {
                handleOrganizationChange(ws);
              }
            }}
          >
            <span className="flex-1 text-left">{ws.name}</span>
            {switchingId === ws.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ws.id === organization?.id ? (
              <Check className="size-4" />
            ) : index < 9 ? (
              <DropdownMenuShortcut>W {index + 1}</DropdownMenuShortcut>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          className="min-h-11 text-sm sm:min-h-9"
          onClick={onCreateOrganization}
        >
          <span>{t("navigation:organizationSwitcher.addOrganization")}</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </div>
  );
}

export default OrganizationMenuSection;
