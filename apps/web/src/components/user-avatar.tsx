import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Mail, Settings, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrganizationMenuSection } from "@/components/organization-switcher";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { ThemeToggleDropdown } from "@/components/theme-toggle-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import useSignOut from "@/hooks/mutations/use-sign-out";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { usePendingInvitations } from "@/hooks/queries/invitation/use-pending-invitations";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";

export function UserAvatar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: config } = useGetConfig();
  const { mutateAsync: signOut, isPending } = useSignOut(
    config?.customOAuthLogoutUrl,
  );
  const queryClient = useQueryClient();
  const { setBoard } = useBoardStore();
  const navigate = useNavigate();
  const { data: invitations = [] } = usePendingInvitations();

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      setBoard(undefined);
      toast.success(t("navigation:userMenu.signedOutSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("navigation:userMenu.signOutFailed"),
      );
    }
  };

  const handleSettings = () => {
    navigate({ to: "/dashboard/settings/account/information" });
  };

  const initials = getInitials(user.name || user.email, "UN");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open profile menu"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full p-0 hover:bg-sidebar-accent/70"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
            <AvatarFallback className="text-xs font-medium border border-border/30">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-0" side="bottom" align="start">
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-2 text-left text-sm">
            <Avatar className="h-7 w-7 rounded-full">
              <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
              <AvatarFallback className="rounded-full border border-border/30">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {user.name || t("navigation:userMenu.unnamedUser")}
              </span>
              {user.email && (
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/*
          #96: the organization selector moved out of the sidebar header into
          this menu, alongside the theme toggle. The sidebar top now hosts the
          team-view selector instead.
        */}
        <div className="p-0.5">
          <OrganizationMenuSection />
          <div
            className="flex h-7 items-center justify-between gap-2 px-2 text-sm font-normal"
            data-testid="user-menu-theme-toggle"
          >
            <span>{t("navigation:userMenu.theme")}</span>
            <ThemeToggleDropdown />
          </div>
        </div>

        <DropdownMenuSeparator />

        <div className="p-0.5">
          <DropdownMenuItem
            onClick={handleSettings}
            className="h-7 gap-2 px-2 text-sm font-normal"
          >
            <Settings className="size-3.5" />
            {t("navigation:userMenu.settings")}
          </DropdownMenuItem>
          {/*
            Invitations are account-scoped, not organization-scoped, so they
            belong beside Settings rather than in the organization's sidebar
            navigation. The pending count is surfaced here so it stays visible
            now that the sidebar entry is gone.
          */}
          <DropdownMenuItem
            onClick={() => navigate({ to: "/dashboard/invitations" })}
            className="h-7 gap-2 px-2 text-sm font-normal"
          >
            <Mail className="size-3.5" />
            {t("navigation:sidebar.invitations")}
            {invitations.length > 0 && (
              <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-sm border border-border/60 px-1 text-[11px] font-medium text-muted-foreground">
                {invitations.length}
              </span>
            )}
          </DropdownMenuItem>
          {user.role === "admin" && (
            <DropdownMenuItem
              onClick={() => navigate({ to: "/dashboard/admin" })}
              className="h-7 gap-2 px-2 text-sm font-normal"
            >
              <Shield className="size-3.5" />
              System administration
            </DropdownMenuItem>
          )}
        </div>

        <DropdownMenuSeparator />

        <div className="p-0.5">
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={isPending}
            className="h-7 gap-2 px-2 text-sm font-normal"
          >
            <LogOut className="size-3.5" />
            {isPending
              ? t("navigation:userMenu.signingOut")
              : t("navigation:userMenu.logOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
