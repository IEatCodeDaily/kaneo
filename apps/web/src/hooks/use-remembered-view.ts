import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetProjectSidebar from "@/hooks/queries/project/use-get-project-sidebar";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
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

  useEffect(() => {
    const boardView = boardViewFromPathname(pathname);
    if (boardView) setLastBoardView(boardView);
    const repoView = repoViewFromPathname(pathname);
    if (repoView) setLastRepoView(repoView);
    if (!organization) return;
    const page = resolveRecentPage(pathname, organization, {
      boards,
      repos,
      projects,
    });
    if (page) rememberRecentPage({ ...page, openedAt: Date.now() });
  }, [
    boards,
    organization,
    pathname,
    projects,
    rememberRecentPage,
    repos,
    setLastBoardView,
    setLastRepoView,
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
