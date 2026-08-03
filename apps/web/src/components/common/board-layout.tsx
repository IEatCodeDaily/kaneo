import {
  useLocation,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  Flag,
  SquareKanban,
  SquircleDashed,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import BoardSyncIndicator from "@/components/board/board-sync-indicator";
import { BoardViewTabs } from "@/components/board/board-view-tabs";
import { BoardSkeleton } from "@/components/common/board-skeleton";
import BoardCrumbSelect from "@/components/common/header/board-crumb-select";
import MobileBoardNav from "@/components/common/header/mobile-board-nav";
import OrganizationCrumbSelect from "@/components/common/header/organization-crumb-select";
import Layout from "@/components/common/layout";
import BoardAccessAvatars from "@/components/presence/board-access-avatars";
import CreateBoardModal from "@/components/shared/modals/create-board-modal";

import useGetBoard from "@/hooks/queries/board/use-get-board";
import { useBoardWebSocket } from "@/hooks/use-board-websocket";
import { type BoardView, boardViewFromPathname } from "@/lib/board-view";
import { useNavigationStore } from "@/store/navigation";

type BoardLayoutProps = {
  boardId: string;
  organizationId: string;
  headerActions?: ReactNode;
  children: ReactNode;
  showViewSwitcher?: boolean;
  activeView?: BoardView;
};

export default function BoardLayout({
  boardId,
  organizationId,
  headerActions,
  children,
  showViewSwitcher = true,
  activeView,
}: BoardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: board } = useGetBoard({ id: boardId, organizationId });
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);

  useBoardWebSocket(boardId);

  const pathView: BoardView =
    activeView ?? boardViewFromPathname(location.pathname) ?? "board";

  // Optimistic view switching.
  //
  // `location.pathname` only updates once React has committed the incoming
  // route, and rendering a 180-task view takes long enough that the tab
  // highlight used to stay on the old tab for the whole stall — the click
  // looked ignored. Recording the intended target on click lets the switcher
  // paint the new tab immediately; `isNavPending` drives the loading hint.
  const [pendingView, setPendingView] = useState<BoardView | null>(null);
  const pendingBoardId = useNavigationStore((s) => s.pendingBoardId);
  const setPendingBoardId = useNavigationStore((s) => s.setPendingBoardId);

  // Drop the optimistic target once the URL agrees with it.
  useEffect(() => {
    if (pendingView && pathView === pendingView) setPendingView(null);
  }, [pathView, pendingView]);
  useEffect(() => {
    if (pendingBoardId && boardId === pendingBoardId) setPendingBoardId(null);
  }, [boardId, pendingBoardId, setPendingBoardId]);

  // Never strand the pending state if a navigation doesn't land.
  useEffect(() => {
    if (!pendingView && !pendingBoardId) return;
    const timer = setTimeout(() => {
      setPendingView(null);
      setPendingBoardId(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [pendingView, pendingBoardId, setPendingBoardId]);

  const resolvedView = pendingView ?? pathView;
  // Router-level pending state covers navigations started elsewhere (the
  // sidebar board list, command palette), which don't go through goToView and
  // so wouldn't otherwise show any feedback.
  const isRouterLoading = useRouterState({
    select: (s) => s.status === "pending",
  });
  const isNavPending =
    pendingView !== null || pendingBoardId !== null || isRouterLoading;

  const goToView = (view: BoardView) => {
    if (view === resolvedView) return;
    setPendingView(view);
    navigate({
      to: `/dashboard/organization/$organizationId/board/$boardId/${view}`,
      params: { organizationId, boardId },
    });
  };

  const handleNavigateToBacklog = () => goToView("backlog");
  const handleNavigateToBoard = () => goToView("board");
  const handleNavigateToGantt = () => goToView("gantt");
  const handleNavigateToCalendar = () => goToView("calendar");
  const handleNavigateToMilestones = () => goToView("milestones");

  const handleBoardSwitch = (nextBoardId: string) => {
    if (nextBoardId === boardId) return;
    setPendingBoardId(nextBoardId);
    navigate({
      to: `/dashboard/organization/$organizationId/board/$boardId/${resolvedView}`,
      params: {
        organizationId,
        boardId: nextBoardId,
      },
    });
  };

  return (
    <Layout>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 items-center gap-1 md:flex">
              <OrganizationCrumbSelect />
              <span className="text-foreground/30 text-xs">/</span>
              <BoardCrumbSelect
                organizationId={organizationId}
                boardId={boardId}
                boardName={board?.name}
                onSelectBoard={handleBoardSwitch}
                onAddBoard={() => setIsCreateBoardModalOpen(true)}
              />
            </div>

            <div className="md:hidden">
              <MobileBoardNav
                organizationId={organizationId}
                boardId={boardId}
                activeView={resolvedView}
                onSelectBacklog={handleNavigateToBacklog}
                onSelectBoardView={handleNavigateToBoard}
                onSelectGantt={handleNavigateToGantt}
                onSelectCalendar={handleNavigateToCalendar}
                onSelectMilestones={handleNavigateToMilestones}
                onSelectBoard={handleBoardSwitch}
                onAddBoard={() => setIsCreateBoardModalOpen(true)}
              />
            </div>

            {headerActions}

            {showViewSwitcher && (
              <BoardViewTabs
                aria-label="Board views"
                className="hidden min-w-0 sm:flex"
                value={resolvedView}
                onValueChange={(value) => goToView(value as BoardView)}
                views={[
                  {
                    value: "backlog",
                    label: "Backlog",
                    icon: <SquircleDashed className="size-3.5" />,
                  },
                  {
                    value: "board",
                    label: "Tasks",
                    icon: <SquareKanban className="size-3.5" />,
                  },
                  {
                    value: "gantt",
                    label: "Timeline",
                    icon: <CalendarDays className="size-3.5" />,
                  },
                  {
                    value: "calendar",
                    label: "Calendar",
                    icon: <CalendarRange className="size-3.5" />,
                  },
                  {
                    value: "milestones",
                    label: "Milestones",
                    icon: <Flag className="size-3.5" />,
                  },
                ]}
              />
            )}
          </div>

          {/*
            #91: pinned to the RIGHT edge of the header, on the same row as the
            breadcrumb and view selector. Sitting immediately after the view
            tabs read as part of that control group, so it was easy to miss —
            access indicators belong at the trailing edge.
          */}
          {organizationId && boardId && (
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              {/* #158: sync indicator sits to the LEFT of the avatars. */}
              <BoardSyncIndicator boardId={boardId} />
              <BoardAccessAvatars
                organizationId={organizationId}
                resourceId={boardId}
                resourceType="board"
              />
            </div>
          )}
        </div>
      </Layout.Header>

      {/* Navigation feedback: a click on a view/board always produces something
          visible, even while the incoming view is still rendering. */}
      {isNavPending ? (
        <div
          className="h-0.5 shrink-0 overflow-hidden bg-primary/15"
          role="status"
          aria-label="Loading view"
        >
          <div className="h-full w-1/3 animate-[nav-progress_1.1s_ease-in-out_infinite] bg-primary/70" />
        </div>
      ) : null}

      {/* On a board switch the outgoing route is still mounted (React hasn't
          committed the new one yet), so its cards would otherwise sit under the
          new board's name for the whole render. Drop them the moment the click
          lands and let the incoming view's own skeleton take over. */}
      <Layout.Content>
        {pendingBoardId ? <BoardSkeleton /> : children}
      </Layout.Content>

      <CreateBoardModal
        open={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
      />
    </Layout>
  );
}
