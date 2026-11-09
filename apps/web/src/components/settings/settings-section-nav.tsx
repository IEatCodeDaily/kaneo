import type { LucideIcon } from "lucide-react";
import { Building2, FolderGit2, LayoutGrid, Library, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";

export type SettingsSection = "account" | "organization" | "boards" | "repos";

type SettingsSectionNavProps = {
  activeSection: SettingsSection;
  pathname?: string;
  hasBoards: boolean;
  hasRepos: boolean;
  reposEnabled: boolean;
  onNavigate: (to: string) => void;
};

type SectionDefinition = {
  id: SettingsSection;
  icon: LucideIcon;
  labelKey: string;
  fallbackLabel: string;
  /**
   * Sections land on a concrete page, not a bare section route — the old tab
   * strip did this and dropping it would leave the user on an empty shell.
   */
  to: string;
};

const ACCOUNT_PAGES = [
  ["information", "settings:information", "Profile"],
  ["notifications", "settings:notifications", "Notifications"],
  ["preferences", "settings:preferences", "Preferences"],
  ["authentication", "settings:navigation.authentication", "Authentication"],
  ["developer", "settings:apiKeys", "API keys"],
];
const ORGANIZATION_PAGES = [
  ["general", "settings:organizationGeneral.title", "General"],
  ["members", "team:members.pageTitle", "Members"],
  ["teams", "settings:navigation.teams", "Teams"],
  ["roles", "settings:organizationRoles.title", "Roles"],
  ["visibility", "settings:navigation.visibility", "Visibility"],
  ["labels", "settings:organizationLabels.title", "Labels"],
  ["templates", "settings:navigation.templates", "Templates"],
  ["integrations", "settings:navigation.integrations", "Integrations"],
  ["features", "settings:navigation.features", "Features"],
];
const SECTIONS: SectionDefinition[] = [
  {
    id: "account",
    icon: User,
    labelKey: "settings:account",
    fallbackLabel: "Account",
    to: "/dashboard/settings/account/information",
  },
  {
    id: "organization",
    icon: Building2,
    labelKey: "navigation:page.settingsOrganizationTab",
    fallbackLabel: "Organization",
    to: "/dashboard/settings/organization/general",
  },
  {
    id: "boards",
    icon: LayoutGrid,
    labelKey: "navigation:sidebar.boards",
    fallbackLabel: "Boards",
    to: "/dashboard/settings/boards",
  },
  {
    id: "repos",
    icon: FolderGit2,
    labelKey: "navigation:sidebar.repos",
    fallbackLabel: "Repos",
    to: "/dashboard/settings/repos",
  },
];

function SectionHeader({
  icon: Icon,
  className,
  children,
}: {
  icon: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 px-2 pb-1.5 font-semibold text-foreground text-sm",
        className,
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      {children}
    </p>
  );
}

/**
 * One sectioned settings navigation, preserving the original conditional
 * behaviour rather than simplifying it: Repos is hidden outright when the
 * organization has repos disabled, and a section with nothing in it is
 * rendered but non-navigable (disabled) so its absence is never mistaken for
 * a missing feature.
 */
export default function SettingsSectionNav({
  activeSection,
  pathname = "",
  hasBoards,
  hasRepos,
  reposEnabled,
  onNavigate,
}: SettingsSectionNavProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(true);

  const isDisabled = (id: SettingsSection) => {
    if (id === "boards") return !hasBoards;
    if (id === "repos") return !hasRepos;
    return false;
  };

  return (
    <details
      open={!isMobile || mobileOpen}
      onToggle={(event) => {
        if (isMobile) setMobileOpen(event.currentTarget.open);
      }}
      className="group/settings"
    >
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm md:hidden">
        {t("navigation:page.settingsTitle")}
      </summary>
      <nav
        aria-label={t("navigation:page.settingsTitle")}
        className="flex max-h-[45vh] flex-col gap-0.5 overflow-y-auto md:max-h-none"
      >
        <SectionHeader icon={Library} className="mt-3">
          {t("settings:navigation.boardsAndRepos", {
            defaultValue: "Resources",
          })}
        </SectionHeader>
        {SECTIONS.filter(
          (section) =>
            (section.id === "boards" || section.id === "repos") &&
            (section.id !== "repos" || reposEnabled),
        ).map((section) => {
          const disabled = isDisabled(section.id);
          const active = activeSection === section.id;
          const Icon = section.icon;

          return (
            <button
              aria-current={active ? "page" : undefined}
              aria-disabled={disabled ? "true" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-left text-sm transition-colors sm:min-h-8",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
              data-active={active ? "true" : undefined}
              data-testid={`settings-section-${section.id}`}
              disabled={disabled}
              key={section.id}
              onClick={() => {
                if (disabled) return;
                onNavigate(section.to);
              }}
              type="button"
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">
                {t(section.labelKey, { defaultValue: section.fallbackLabel })}
              </span>
            </button>
          );
        })}
        {(["account", "organization"] as const).map((section) => (
          <div
            key={section}
            className="order-first mt-3 border-b border-border pb-3"
          >
            <SectionHeader icon={section === "account" ? User : Building2}>
              {t(
                section === "account"
                  ? "settings:account"
                  : "navigation:page.settingsOrganizationTab",
              )}
            </SectionHeader>
            {(section === "account" ? ACCOUNT_PAGES : ORGANIZATION_PAGES).map(
              ([segment, key, label]) => {
                const to = `/dashboard/settings/${section}/${segment}`;
                return (
                  <button
                    key={to}
                    type="button"
                    data-settings-path={to}
                    aria-current={pathname === to ? "page" : undefined}
                    data-testid={
                      segment ===
                      (section === "account" ? "information" : "general")
                        ? `settings-section-${section}`
                        : undefined
                    }
                    data-active={activeSection === section ? "true" : undefined}
                    onClick={() => onNavigate(to)}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-md pr-2 pl-8 text-left text-sm hover:bg-accent hover:text-foreground sm:min-h-8",
                      pathname === to
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(key, { defaultValue: label })}
                  </button>
                );
              },
            )}
          </div>
        ))}
      </nav>
    </details>
  );
}
