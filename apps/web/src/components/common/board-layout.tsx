import { useLocation, useNavigate } from "@tanstack/react-router";
import { CalendarDays, SquareKanban, SquircleDashed } from "lucide-react";
import { type ReactNode, useState } from "react";
import MobileBoardNav from "@/components/common/header/mobile-board-nav";
import BoardCrumbSelect from "@/components/common/header/board-crumb-select";
import OrganizationCrumbSelect from "@/components/common/header/organization-crumb-select";
import Layout from "@/components/common/layout";
import CreateBoardModal from "@/components/shared/modals/create-board-modal";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useGetBoard from "@/hooks/queries/board/use-get-board";
import { useBoardWebSocket } from "@/hooks/use-board-websocket";
import { cn } from "@/lib/cn";

type BoardLayoutProps = {
  boardId: string;
  organizationId: string;
  headerActions?: ReactNode;
  children: ReactNode;
  showViewSwitcher?: boolean;
  activeView?: "backlog" | "board" | "gantt";
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
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] =
    useState(false);

  useBoardWebSocket(boardId);

  const resolvedView =
    activeView ??
    (location.pathname.includes("/backlog")
      ? "backlog"
      : location.pathname.includes("/gantt")
        ? "gantt"
        : "board");

  const handleNavigateToBacklog = () => {
    navigate({
      to: "/dashboard/organization/$organizationId/board/$boardId/backlog",
      params: { organizationId, boardId },
    });
  };

  const handleNavigateToBoard = () => {
    navigate({
      to: "/dashboard/organization/$organizationId/board/$boardId/board",
      params: { organizationId, boardId },
    });
  };

  const handleNavigateToGantt = () => {
    navigate({
      to: "/dashboard/organization/$organizationId/board/$boardId/gantt",
      params: { organizationId, boardId },
    });
  };

  const handleBoardSwitch = (nextBoardId: string) => {
    navigate({
      to:
        resolvedView === "backlog"
          ? "/dashboard/organization/$organizationId/board/$boardId/backlog"
          : resolvedView === "gantt"
            ? "/dashboard/organization/$organizationId/board/$boardId/gantt"
            : "/dashboard/organization/$organizationId/board/$boardId/board",
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 h-7 w-7 cursor-pointer text-foreground/85 hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-2 text-[10px]">
                    Toggle sidebar
                    <KbdSequence
                      keys={[
                        shortcuts.sidebar.prefix,
                        shortcuts.sidebar.toggle,
                      ]}
                    />
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="h-4 w-px shrink-0 bg-border/80" />

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
                onSelectBoard={handleBoardSwitch}
                onAddBoard={() => setIsCreateBoardModalOpen(true)}
              />
            </div>

            {showViewSwitcher && (
              <div className="hidden h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 sm:inline-flex">
                <Button
                  variant={resolvedView === "backlog" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={handleNavigateToBacklog}
                  className={cn(
                    "h-6 gap-1.5 rounded-md px-2 text-xs",
                    resolvedView !== "backlog" && "text-muted-foreground",
                  )}
                >
                  <SquircleDashed className="size-3.5" />
                  Backlog
                </Button>
                <Button
                  variant={resolvedView === "board" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={handleNavigateToBoard}
                  className={cn(
                    "h-6 gap-1.5 rounded-md px-2 text-xs",
                    resolvedView !== "board" && "text-muted-foreground",
                  )}
                >
                  <SquareKanban className="size-3.5" />
                  Tasks
                </Button>
                <Button
                  variant={resolvedView === "gantt" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={handleNavigateToGantt}
                  className={cn(
                    "h-6 gap-1.5 rounded-md px-2 text-xs",
                    resolvedView !== "gantt" && "text-muted-foreground",
                  )}
                >
                  <CalendarDays className="size-3.5" />
                  Gantt
                </Button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
          </div>
        </div>
      </Layout.Header>

      <Layout.Content>{children}</Layout.Content>

      <CreateBoardModal
        open={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
      />
    </Layout>
  );
}
