import { createFileRoute, useLocation } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import ResourceSettingsShell from "@/components/settings/resource-settings-shell";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards",
)({ component: BoardSettings });

function BoardSettings() {
  const { t } = useTranslation();
  const { organization } = useOrganizationPermission();
  const { data: boards = [] } = useGetBoards({
    organizationId: organization?.id ?? "",
  });
  const { pathname } = useLocation();
  return (
    <ResourceSettingsShell
      base="/dashboard/settings/boards"
      icon={LayoutGrid}
      title={t("navigation:sidebar.boards")}
      items={boards.map((board) => ({ id: board.id, label: board.name }))}
      tabs={[
        { segment: "general", label: t("settings:boardGeneral.title") },
        { segment: "visibility", label: t("settings:boardVisibility.title") },
        {
          segment: "integrations",
          label: t("settings:boardIntegrations.title"),
        },
        { segment: "workflow", label: t("settings:boardWorkflow.title") },
      ]}
      activeId={pathname.match(/\/settings\/boards\/([^/]+)/)?.[1]}
      activeSegment={pathname.substring(pathname.lastIndexOf("/") + 1)}
      emptyLabel={t("settings:boardSwitcher.noBoards")}
      selectLabel={t("settings:boardSwitcher.selectBoard")}
    />
  );
}
