import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, UsersRound } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { VersionDisplay } from "@/components/version-display";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizations from "@/hooks/queries/organization/use-get-organizations";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { useTeamViewStore } from "@/store/team-view";
import type { Organization } from "@/types/organization";

type TeamOption = {
  id: string;
  name: string;
};

function OrgAvatar({
  organization,
  className,
}: {
  organization?: Organization | null;
  className?: string;
}) {
  const initials =
    organization?.name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part[0])
      .join("")
      .toUpperCase() || "OR";
  return (
    <Avatar className={cn("rounded-full bg-sidebar-accent", className)}>
      {/* An empty src renders a broken-image blob in dark mode; fall straight
          to initials when no logo is set. */}
      {organization?.logo ? (
        <AvatarImage src={organization.logo} alt={organization?.name ?? ""} />
      ) : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

/**
 * The merged sidebar identity selector: one trigger showing the organization
 * and the active team scope, one menu that lists the current organization's
 * teams first, then the other organizations. Members/Settings live in the
 * sidebar footer, not here.
 */
export function OrgTeamSelector({
  open,
  onOpenChange,
  onAddOrganization,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddOrganization: () => void;
}) {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: organization } = useActiveOrganization();
  const { data: organizations } = useGetOrganizations();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { teamId, teamName, setTeamView } = useTeamViewStore();
  const organizationId = organization?.id ?? "";

  const teams = useQuery({
    queryKey: ["organization-teams", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<TeamOption[]> => {
      const result = await authClient.organization.listTeams({
        query: { organizationId },
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to load teams");
      }
      return (result.data ?? []).map((team: { id: string; name: string }) => ({
        id: team.id,
        name: team.name,
      }));
    },
  });

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
          onAddOrganization();
        },
      },
    },
  });

  const allLabel = t("navigation:teamView.all");
  const teamLabel = teamId ? (teamName ?? allLabel) : allLabel;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            data-testid="sidebar-organization-identity"
            aria-expanded={open}
            className={cn(
              // h-auto at both breakpoints: the size variant's h-11/md:h-7
              // otherwise clips the second (team) row.
              "h-auto md:h-auto min-w-0 flex-1 flex-col items-stretch gap-0.5 rounded-md px-2 py-1 text-sidebar-foreground",
              collapsed && "items-center px-0 py-0",
            )}
            size="default"
            tooltip={organization?.name ?? ""}
          />
        }
      >
        {/* User-card lockup: org avatar left with the team badge overlapping
            its lower-right edge (reference sketch); team name as the primary
            line, org name muted beneath. */}
        {!collapsed ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="relative shrink-0 self-start">
              <OrgAvatar organization={organization} className="size-8" />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground ring-2 ring-sidebar">
                <UsersRound aria-hidden="true" className="size-2.5" />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start">
              <span
                className="w-full truncate text-left text-sm font-medium text-foreground"
                data-testid="team-view-selector-value"
              >
                {teamLabel}
              </span>
              <span className="w-full truncate text-left text-xs text-muted-foreground">
                {organization?.name}
              </span>
            </span>
          </span>
        ) : (
          <span className="relative shrink-0">
            <OrgAvatar organization={organization} className="size-8" />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground ring-2 ring-sidebar">
              <UsersRound aria-hidden="true" className="size-2.5" />
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-64"
      >
        {/* Teams of the current organization first, then other organizations. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("navigation:teamView.teams")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="min-h-11 gap-2 text-sm sm:min-h-9"
            onClick={() => setTeamView(null, null)}
          >
            <UsersRound aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex-1">{allLabel}</span>
            <Check
              aria-hidden="true"
              className={cn("size-4", teamId ? "opacity-0" : "opacity-100")}
            />
          </DropdownMenuItem>
          {(teams.data ?? []).map((team: TeamOption) => (
            <DropdownMenuItem
              className="min-h-11 gap-2 text-sm sm:min-h-9"
              key={team.id}
              onClick={() => setTeamView(team.id, team.name)}
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-medium uppercase">
                {team.name.slice(0, 2)}
              </span>
              <span className="flex-1">{team.name}</span>
              <Check
                aria-hidden="true"
                className={cn(
                  "size-4",
                  teamId === team.id ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("navigation:organizationSwitcher.organizations")}
          </DropdownMenuLabel>
          {organizations?.map((ws: Organization, index: number) => (
            <DropdownMenuItem
              className="min-h-11 gap-2 text-sm sm:min-h-9"
              disabled={isSwitching || ws.id === organization?.id}
              key={ws.id}
              onClick={() => {
                if (!isSwitching && ws.id !== organization?.id) {
                  handleOrganizationChange(ws);
                }
              }}
            >
              <OrgAvatar organization={ws} className="size-4 shrink-0" />
              <span className="flex-1">{ws.name}</span>
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
            onClick={onAddOrganization}
          >
            <span>{t("navigation:organizationSwitcher.addOrganization")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5" data-testid="sidebar-version">
          <VersionDisplay />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OrgTeamSelector;
