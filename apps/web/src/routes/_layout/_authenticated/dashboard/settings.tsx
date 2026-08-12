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
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const getActiveTab = () => {
    const pathname = location.pathname;
    if (pathname.includes("/dashboard/settings/account")) {
      return "account";
    }
    if (pathname.includes("/dashboard/settings/organization")) {
      return "organization";
    }
    if (pathname.includes("/dashboard/settings/boards")) {
      return "board";
    }
    if (pathname.includes("/dashboard/settings/repos")) {
      return "repo";
    }
    return "account";
  };

  const activeTab = getActiveTab();

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />
      <div className="flex flex-col gap-4 p-4 bg-sidebar w-full h-full">
        <div className="flex flex-col gap-4 bg-card h-full border border-border rounded-md p-4 relative overflow-hidden">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/dashboard/organization/$organizationSlug",
                  params: { organizationSlug: organization?.slug ?? "" },
                })
              }
            >
              <ChevronLeft className=" border border-border rounded-md p-1 size-6" />
              {t("navigation:page.backToOrganization")}
            </Button>

            <h1 className="text-2xl font-semibold pl-2 mt-2">
              {t("navigation:page.settingsTitle")}
            </h1>

            <Tabs value={activeTab} className="w-fit pt-2">
              <TabsList className="bg-sidebar gap-2">
                <TabsTrigger
                  className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
                  value="account"
                  onClick={() =>
                    navigate({ to: "/dashboard/settings/account/information" })
                  }
                >
                  {t("settings:account")}
                </TabsTrigger>
                <TabsTrigger
                  value="organization"
                  className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
                  onClick={() =>
                    navigate({ to: "/dashboard/settings/organization/general" })
                  }
                >
                  {t("navigation:page.settingsOrganizationTab")}
                </TabsTrigger>
                <TabsTrigger
                  disabled={boards?.length === 0}
                  value="board"
                  className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
                  onClick={() => navigate({ to: "/dashboard/settings/boards" })}
                >
                  {t("navigation:sidebar.boards")}
                </TabsTrigger>
                {organization?.reposEnabled ? (
                  <TabsTrigger
                    disabled={repos?.length === 0}
                    value="repo"
                    className="[&[data-state=active]]:border [&[data-state=active]]:border-border [&[data-state=active]]:rounded-md [&[data-state=active]]:bg-card"
                    onClick={() =>
                      navigate({ to: "/dashboard/settings/repos" })
                    }
                  >
                    Repos
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}
