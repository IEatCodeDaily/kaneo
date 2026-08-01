import { useNavigate } from "@tanstack/react-router";
import { Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useGetBoard from "@/hooks/queries/board/use-get-board";
import useGetTask from "@/hooks/queries/task/use-get-task";
import {
  clampTaskDrawerWidth,
  parseStoredTaskDrawerWidth,
  TASK_DRAWER_WIDTH_STORAGE_KEY,
  widthFromPointer,
} from "@/lib/task-drawer-width";
import TaskDetailsContent from "./task-details-content";
import TaskPropertiesSidebar from "./task-properties-sidebar";
import TaskTopbarControls from "./task-topbar-controls";

type TaskDetailsSheetProps = {
  taskId: string | undefined;
  boardId: string;
  organizationId: string;
  onClose: () => void;
};

export default function TaskDetailsSheet({
  taskId,
  boardId,
  organizationId,
  onClose,
}: TaskDetailsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(
    taskId,
  );
  const [isOpen, setIsOpen] = useState(Boolean(taskId));

  const { data: task } = useGetTask(currentTaskId ?? "");
  const { data: board } = useGetBoard({ id: boardId, organizationId });

  useEffect(() => {
    if (taskId) {
      // Update taskId immediately without closing/reopening
      setCurrentTaskId(taskId);
      setIsOpen(true);
    } else {
      // Delay clearing to allow exit animation
      const timer = setTimeout(() => {
        setCurrentTaskId(undefined);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [taskId]);

  // #112: the drawer is resizable by dragging its left edge, and the width
  // persists. Hydrate from storage BEFORE the first paint-driven save so the
  // default render can't overwrite what the user chose.
  const [width, setWidth] = useState<number | null>(null);
  const isResizingRef = useRef(false);

  useEffect(() => {
    setWidth(
      parseStoredTaskDrawerWidth(
        window.localStorage.getItem(TASK_DRAWER_WIDTH_STORAGE_KEY),
        window.innerWidth,
      ),
    );
  }, []);

  // Re-clamp when the window shrinks, otherwise a width saved on a wide
  // monitor leaves the drawer wider than the viewport.
  useEffect(() => {
    const onResize = () =>
      setWidth((current) =>
        current === null
          ? current
          : clampTaskDrawerWidth(current, window.innerWidth),
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    isResizingRef.current = true;

    const onMove = (moveEvent: PointerEvent) => {
      if (!isResizingRef.current) return;
      setWidth(widthFromPointer(moveEvent.clientX, window.innerWidth));
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setWidth((current) => {
        if (current !== null) {
          window.localStorage.setItem(
            TASK_DRAWER_WIDTH_STORAGE_KEY,
            String(current),
          );
        }
        return current;
      });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  const handleClose = useCallback(() => {
    // Do not keep the drawer visually open while the router processes removal
    // of the taskId search param (which can trigger route/query work).
    setIsOpen(false);
    onClose();
  }, [onClose]);

  const handleOpenFullPage = useCallback(() => {
    if (!currentTaskId) return;
    navigate({
      to: "/dashboard/organization/$organizationId/board/$boardId/task/$taskId",
      params: {
        organizationId,
        boardId,
        taskId: currentTaskId,
      },
    });
  }, [navigate, organizationId, boardId, currentTaskId]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        // #103: the drawer was `lg:max-w-4xl` — 896px, ~62% of a 1440px
        // viewport — which buried the board behind it. One step down keeps
        // the description readable while leaving the board visible.
        className="w-full max-w-full sm:max-w-md md:max-w-xl lg:max-w-3xl p-0 gap-0 [&>button]:hidden"
        // An explicit width overrides the responsive max-* classes once the
        // user has dragged; until hydration finishes we keep the CSS default.
        style={width ? { width: `${width}px`, maxWidth: "100vw" } : undefined}
      >
        {/** biome-ignore lint/a11y/noStaticElementInteractions: resize grip is a pointer affordance mirrored by the width controls */}
        <div
          data-testid="task-drawer-resize-handle"
          onPointerDown={startResize}
          className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
        />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {board?.slug}-{task?.number}
            </span>
            {currentTaskId && (
              <TaskTopbarControls
                taskId={currentTaskId}
                boardId={boardId}
                organizationId={organizationId}
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            {/*
              #146 / #91: board access avatars belong on the BOARD topbar, not
              on every ticket. They describe who can see the board, which is
              board-level information repeated on each ticket drawer.
            */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenFullPage}
                    className="text-foreground"
                  >
                    <Maximize2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("tasks:detail.openInFullPage")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("tasks:detail.close")}
              onClick={handleClose}
              className="text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
          key={currentTaskId}
        >
          <TaskPropertiesSidebar
            taskId={currentTaskId}
            boardId={boardId}
            organizationId={organizationId}
            className="w-full bg-sidebar border-b border-border flex flex-col gap-0 overflow-y-auto shrink-0"
            compact={true}
          />

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 py-4">
              <TaskDetailsContent
                taskId={currentTaskId}
                boardId={boardId}
                organizationId={organizationId}
                className="flex flex-col gap-3"
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
