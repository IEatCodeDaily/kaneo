import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import SettingsSectionNav, {
  type SettingsSection,
} from "@/components/settings/settings-section-nav";
import { Button } from "@/components/ui/button";
import getOrganizations from "@/fetchers/organization/get-organizations";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { authClient } from "@/lib/auth-client";

let hasResolvedActiveOrganization = false;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings",
)({
  beforeLoad: async () => {
    if (hasResolvedActiveOrganization) return;

    const session = await authClient.getSession();
    if (!session?.data?.session?.activeOrganizationId) {
      const organizations = await getOrganizations();
      if (organizations.length === 0) throw redirect({ to: "/onboarding" });
      await authClient.organization.setActive({
        organizationId: organizations[0].id,
      });
    }
    hasResolvedActiveOrganization = true;
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const { data: boards } = useGetBoards({
    organizationId: organization?.id ?? "",
  });
  const { data: repos } = useGetRepos({
    organizationId: organization?.id ?? "",
    enabled: organization?.reposEnabled === true,
  });

  const getActiveSection = (): SettingsSection => {
    const pathname = location.pathname;
    if (pathname.includes("/dashboard/settings/organization")) {
      return "organization";
    }
    if (pathname.includes("/dashboard/settings/boards")) {
      return "boards";
    }
    if (pathname.includes("/dashboard/settings/repos")) {
      return "repos";
    }
    return "account";
  };

  const activeSection = getActiveSection();

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />
      {/*
        #125: settings does not render <Layout> — its section nav takes the
        app sidebar's slot (Linear-style). design v3: same frame as every
        page — 240px nav on the sidebar surface, content on the bordered
        inset with the 44px header; no card nested inside the inset.
      */}
      <div className="flex h-svh w-full flex-col bg-sidebar md:flex-row">
        <aside className="flex shrink-0 flex-col gap-1 overflow-y-auto p-2 md:w-60">
          {/* KFL-188: Back to the organization stays top-left. */}
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationSlug",
                params: { organizationSlug: organization?.slug ?? "" },
              })
            }
          >
            <ChevronLeft />
            {t("navigation:page.backToOrganization")}
          </Button>
          <SettingsSectionNav
            activeSection={activeSection}
            pathname={location.pathname}
            hasBoards={(boards?.length ?? 0) > 0}
            hasRepos={(repos?.length ?? 0) > 0}
            onNavigate={(to) => navigate({ to })}
            reposEnabled={organization?.reposEnabled === true}
          />
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background md:my-2 md:mr-2 md:rounded-lg md:border md:border-border">
          <header className="flex h-11 shrink-0 items-center border-b border-border px-3">
            <span className="text-ui font-medium">
              {t("navigation:page.settingsTitle")}
            </span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
