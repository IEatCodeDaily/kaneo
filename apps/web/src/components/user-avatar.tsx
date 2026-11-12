import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  Keyboard,
  LogOut,
  Mail,
  Shield,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { openKeyboardShortcutsHelp } from "@/components/keyboard-shortcuts-help";
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
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";

/**
 * Account menu trigger.
 * - "row" (sidebar, design v3 §4): 40px row with 20px avatar, name, email and chevrons;
 *   `collapsed` shrinks it to the avatar in a 28px square so the menu stays reachable on the rail.
 * - "avatar" (mobile FAB): the round avatar button.
 */
export function UserAvatar({
  variant = "avatar",
  collapsed = false,
}: {
  variant?: "avatar" | "row";
  collapsed?: boolean;
} = {}) {
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
  const { data: organization } = useActiveOrganization();

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

  const initials = getInitials(user.name || user.email, "UN");
  const tone = getAvatarTone(user.id, user.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "row" ? (
          <button
            type="button"
            aria-label="Open profile menu"
            className={cn(
              "flex w-full min-w-0 cursor-pointer items-center rounded-md text-left outline-hidden ring-sidebar-ring transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-popup-open:bg-sidebar-accent",
              collapsed ? "size-7 justify-center" : "h-10 gap-1.5 px-1",
            )}
          >
            <Avatar className={cn("size-5 shrink-0", !user.image && tone)}>
              {user.image ? (
                <AvatarImage src={user.image} alt={user.name || ""} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-[10px] font-medium",
                  user.image ? "bg-transparent" : tone,
                )}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-ui font-medium text-sidebar-foreground">
                    {user.name || t("navigation:userMenu.unnamedUser")}
                  </span>
                  {user.email && (
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        ) : (
          <Button
            aria-label="Open profile menu"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full p-0 hover:bg-sidebar-accent/70 sm:size-8"
          >
            {/* The tone tints initials only; behind a real picture it leaked
                through transparent avatars as a halo (dark mode report). */}
            <Avatar className={`h-8 w-8 ${user.image ? "" : tone}`}>
              {user.image ? (
                <AvatarImage src={user.image} alt={user.name || ""} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-xs font-medium border border-border/30",
                  user.image ? "bg-transparent" : tone,
                )}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-60 p-0"
        side={variant === "row" && collapsed ? "right" : "top"}
        align="start"
      >
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-2 text-left text-sm">
            <Avatar
              className={`h-7 w-7 rounded-full ${user.image ? "" : tone}`}
            >
              {user.image ? (
                <AvatarImage src={user.image} alt={user.name || ""} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "rounded-full border border-border/30",
                  user.image ? "bg-transparent" : tone,
                )}
              >
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

        <div className="p-0.5">
          {/* Invitations remain account-scoped. */}
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
          {/*
            #145: Trash moved out of the main sidebar nav into this menu. It is
            a recovery surface visited occasionally, so it does not need a
            permanent nav slot — but it stays reachable here. Organization
            -scoped, so it only renders once an organization is resolved.
          */}
          {organization && (
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: `/dashboard/organization/${organization.slug}/trash`,
                })
              }
              className="h-7 gap-2 px-2 text-sm font-normal"
            >
              <Trash2 className="size-3.5" />
              {t("navigation:sidebar.trash")}
            </DropdownMenuItem>
          )}
          {/*
            #115: the shortcuts help lives here, next to the other
            account-level entries. The dialog itself is mounted once at the app
            root, so this only has to ask it to open.
          */}
          <DropdownMenuItem
            className="h-7 gap-2 px-2 text-sm font-normal"
            data-testid="profile-menu-shortcuts"
            onClick={() => openKeyboardShortcutsHelp()}
          >
            <Keyboard className="size-3.5" />
            {t("navigation:keyboardShortcuts.title")}
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

        {/* Theme and account actions remain in the user menu. */}
        <DropdownMenuSeparator data-testid="user-menu-theme-separator" />

        <div className="p-0.5">
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
          {/* #155: destructive styling — logging out ends the session. */}
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={isPending}
            className="h-7 gap-2 px-2 text-sm font-normal text-destructive focus:text-destructive data-highlighted:text-destructive"
            data-testid="user-menu-logout"
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
