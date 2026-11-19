import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDashboards } from "@/hooks/dashboards/use-dashboards";
import { useDataTables } from "@/hooks/data-table/use-data-tables";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetProjectSidebar from "@/hooks/queries/project/use-get-project-sidebar";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { useDashboardsEnabled } from "@/hooks/use-dashboards-enabled";
import {
  type BoardView,
  boardViewFromPathname,
  type RepoView,
  repoViewFromPathname,
} from "@/lib/board-view";
import { resolveRecentPage } from "@/lib/recent-page";
import { useTeamViewStore } from "@/store/team-view";
import { useUserPreferencesStore } from "@/store/user-preferences";

/**
 * Records the board/repo view the user is currently in so that returning to a
 * board or repo lands on the last view they used, instead of always the
 * default. Persisted via the user-preferences store (localStorage).
 */
export function useRememberCurrentView() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setLastBoardView = useUserPreferencesStore((s) => s.setLastBoardView);
  const setLastRepoView = useUserPreferencesStore((s) => s.setLastRepoView);
  const rememberRecentPage = useUserPreferencesStore(
    (s) => s.rememberRecentPage,
  );
  const { data: organization } = useActiveOrganization();
  const teamId = useTeamViewStore((state) => state.teamId);
  const { data: boards = [] } = useGetBoards({
    organizationId: organization?.id ?? "",
    teamId,
  });
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id ?? "",
    teamId,
  });
  const { data: projects = [] } = useGetProjectSidebar(organization?.id ?? "");
  const dashboardsEnabled = useDashboardsEnabled();
  const { data: dashboards = [] } = useDashboards(
    organization?.id ?? "",
    dashboardsEnabled,
  );
  const tablesEnabled = Boolean(
    (
      organization as
        | (typeof organization & { tablesEnabled?: boolean })
        | undefined
    )?.tablesEnabled,
  );
  const { data: tables = [] } = useDataTables(
    organization?.id ?? "",
    tablesEnabled,
  );

  useEffect(() => {
    const boardView = boardViewFromPathname(pathname);
    if (boardView) setLastBoardView(boardView);
    const repoView = repoViewFromPathname(pathname);
    if (repoView) setLastRepoView(repoView);
    // Ticket pages live outside the /organization/ segment, so record them
    // directly; ticket-page.tsx later enriches the label with the title.
    const ticketMatch = /^\/dashboard\/[^/]+\/tickets\/[^/?]+/.exec(pathname);
    if (ticketMatch) {
      const key = ticketMatch[0].split("/").pop() ?? "";
      rememberRecentPage({
        pathname: ticketMatch[0],
        label: key,
        detail: key,
        kind: "ticket",
        openedAt: Date.now(),
      });
      return;
    }
    if (!organization) return;
    const page = resolveRecentPage(pathname, organization, {
      boards,
      repos,
      projects,
      dashboards,
      tables,
    });
    if (page) rememberRecentPage({ ...page, openedAt: Date.now() });
  }, [
    boards,
    dashboards,
    organization,
    pathname,
    projects,
    rememberRecentPage,
    repos,
    setLastBoardView,
    setLastRepoView,
    tables,
  ]);
}

/** The view a board link should point at: current view, else last remembered. */
export function useTargetBoardView(): BoardView {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastBoardView = useUserPreferencesStore((s) => s.lastBoardView);
  return boardViewFromPathname(pathname) ?? lastBoardView;
}

/** The view a repo link should point at: current view, else last remembered. */
export function useTargetRepoView(): RepoView {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastRepoView = useUserPreferencesStore((s) => s.lastRepoView);
  return repoViewFromPathname(pathname) ?? lastRepoView;
}
