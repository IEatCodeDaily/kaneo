import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  EyeOff,
  Folder,
  Forward,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import useDeleteBoard from "@/hooks/mutations/board/use-delete-board";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { BoardWithTasks } from "@/types/board";
import CreateBoardModal from "./shared/modals/create-board-modal";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export function NavBoards() {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const { data: organization } = useActiveOrganization();
  const { data: boards } = useGetBoards({
    organizationId: organization?.id || "",
  });
  const queryClient = useQueryClient();
  const { mutateAsync: deleteBoard } = useDeleteBoard();
  const { canCreateBoards, canDeleteBoards } = useOrganizationPermission();
  const canCreate = canCreateBoards();
  const canDeleteBoard = canDeleteBoards();
  const { hiddenBoardIds, setBoardSidebarVisibility } =
    useUserPreferencesStore();
  const navigate = useNavigate();
  const { organizationId: currentOrganizationId, boardId: currentBoardId } =
    useParams({
      strict: false,
    });

  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] = useState(false);
  const [boardToDeleteId, setBoardToDeleteID] = useState<string | null>(null);

  const isCurrentBoard = (boardId: string) => {
    return (
      currentBoardId === boardId && currentOrganizationId === organization?.id
    );
  };

  const handleBoardClick = (board: BoardWithTasks) => {
    navigate({
      to: "/dashboard/organization/$organizationId/board/$boardId/board",
      params: {
        organizationId: organization?.id || "",
        boardId: board.id,
      },
    });
  };

  const handleShareBoard = (board: BoardWithTasks) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/dashboard/organization/${organization?.id}/board/${board.id}`,
    );
    toast.success(t("navigation:boardList.linkCopied"));
  };

  const handleBoardSettings = (board: BoardWithTasks) => {
    navigate({
      to: "/dashboard/settings/boards/$boardId/general",
      params: { boardId: board.id },
    });
  };

  const handleDeleteBoard = (board: BoardWithTasks) => {
    setBoardToDeleteID(board.id);
    setIsDeleteBoardModalOpen(true);
  };

  if (!organization) return null;

  const hiddenBoards =
    boards?.filter((board) => hiddenBoardIds.includes(board.id)) ?? [];
  const visibleBoards =
    boards?.filter((board) => !hiddenBoardIds.includes(board.id)) ?? [];

  return (
    <>
      <SidebarGroup className="group/boards group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
        <div className="relative flex items-center">
          <SidebarGroupLabel
            className="h-7 flex-1 cursor-pointer px-0 pr-12 text-sidebar-accent-foreground hover:text-sidebar-accent-foreground/80"
            render={<button type="button" />}
            onClick={() =>
              navigate({
                to: "/dashboard/organization/$organizationId",
                params: { organizationId: organization.id },
              })
            }
          >
            <span>{t("navigation:sidebar.boards")}</span>
          </SidebarGroupLabel>
          <div className="absolute right-0 flex items-center">
            {canCreate && (
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 group-focus-within/boards:opacity-100 group-hover/boards:opacity-100"
                onClick={() => setIsCreateBoardModalOpen(true)}
              >
                <Plus className="size-4" />
                <span className="sr-only">
                  {t("navigation:boardList.addBoard")}
                </span>
              </button>
            )}
            {hiddenBoards.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">
                    {t("navigation:sidebar.more")}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-lg">
                  {hiddenBoards.map((board) => (
                    <DropdownMenuItem
                      className="cursor-pointer text-sm"
                      key={board.id}
                      onClick={() => setBoardSidebarVisibility(board.id, true)}
                    >
                      Show {board.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {visibleBoards.map((board) => {
              return (
                <ContextMenu key={board.id}>
                  <ContextMenuTrigger asChild>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={isCurrentBoard(board.id)}
                        size="default"
                        className="h-8 gap-0 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                        onClick={() => handleBoardClick(board)}
                      >
                        <span>{board.name}</span>
                      </SidebarMenuButton>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              className="absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-lg p-0 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground after:-inset-2 after:absolute md:after:hidden peer-data-[size=sm]/menu-button:top-1 peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 group-data-[collapsible=icon]:hidden group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0"
                            />
                          }
                        >
                          <MoreHorizontal />
                          <span className="sr-only">
                            {t("navigation:sidebar.more")}
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="w-44 rounded-lg"
                          side={isMobile ? "bottom" : "right"}
                          align={isMobile ? "end" : "start"}
                        >
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() => handleBoardClick(board)}
                          >
                            <Folder className="text-muted-foreground" />
                            <span>{t("navigation:boardList.viewBoard")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() => handleShareBoard(board)}
                          >
                            <Forward className="text-muted-foreground" />
                            <span>{t("navigation:boardList.shareBoard")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() => handleBoardSettings(board)}
                          >
                            <Settings className="text-muted-foreground" />
                            <span>
                              {t("navigation:boardList.boardSettings")}
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() =>
                              setBoardSidebarVisibility(board.id, false)
                            }
                          >
                            <EyeOff className="text-muted-foreground" />
                            <span>Hide from sidebar</span>
                          </DropdownMenuItem>
                          {canDeleteBoard && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="h-7 items-start text-destructive cursor-pointer text-sm"
                                onClick={() => handleDeleteBoard(board)}
                              >
                                <Trash2 className="text-destructive" />
                                <span>
                                  {t("navigation:boardList.deleteBoard")}
                                </span>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onClick={() => handleBoardClick(board)}>
                      <Folder className="text-muted-foreground" />
                      {t("navigation:boardList.viewBoard")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleShareBoard(board)}>
                      <Forward className="text-muted-foreground" />
                      {t("navigation:boardList.shareBoard")}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleBoardSettings(board)}>
                      <Settings className="text-muted-foreground" />
                      {t("navigation:boardList.boardSettings")}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => setBoardSidebarVisibility(board.id, false)}
                    >
                      <EyeOff className="text-muted-foreground" />
                      Hide from sidebar
                    </ContextMenuItem>
                    {canDeleteBoard && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-destructive"
                          onClick={() => handleDeleteBoard(board)}
                        >
                          <Trash2 className="text-destructive" />
                          {t("navigation:boardList.deleteBoard")}
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <CreateBoardModal
        open={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
      />

      <AlertDialog
        open={isDeleteBoardModalOpen}
        onOpenChange={setIsDeleteBoardModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("navigation:boardList.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("navigation:boardList.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline" size="sm">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose
              onClick={async () => {
                await deleteBoard({
                  id: boardToDeleteId || "",
                });
                toast.success(t("navigation:boardList.deletedToast"));
                queryClient.invalidateQueries({
                  queryKey: ["boards"],
                });
                navigate({
                  to: "/dashboard/organization/$organizationId",
                  params: {
                    organizationId: organization?.id || "",
                  },
                });
              }}
            >
              <Button variant="destructive" size="sm">
                {t("navigation:boardList.deleteBoard")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
