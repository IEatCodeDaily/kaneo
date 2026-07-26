import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronRight,
  Folder,
  Forward,
  MoreHorizontal,
  Settings,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  const navigate = useNavigate();
  const { organizationId: currentOrganizationId, boardId: currentBoardId } =
    useParams({
      strict: false,
    });

  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] =
    useState(false);
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] =
    useState(false);
  const [boardToDeleteId, setBoardToDeleteID] = useState<string | null>(
    null,
  );

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

  if (!organization) return null;

  return (
    <>
      <Collapsible defaultOpen className="group/collapsible">
        <SidebarGroup className="group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
          <CollapsibleTrigger
            className="data-panel-open:[&_svg]:rotate-90"
            render={
              <SidebarGroupLabel className="h-7 cursor-pointer justify-between px-0 text-sidebar-accent-foreground" />
            }
          >
            <span>{t("navigation:sidebar.boards")}</span>
            <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {boards?.map((board) => {
                  return (
                    <SidebarMenuItem key={board.id}>
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
                            <span>
                              {t("navigation:boardList.viewBoard")}
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `${window.location.origin}/dashboard/organization/${organization?.id}/board/${board.id}`,
                              );
                              toast.success(
                                t("navigation:boardList.linkCopied"),
                              );
                            }}
                          >
                            <Forward className="text-muted-foreground" />
                            <span>
                              {t("navigation:boardList.shareBoard")}
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-7 items-start cursor-pointer text-sm"
                            onClick={() => {
                              navigate({
                                to: "/dashboard/settings/boards/$boardId/general",
                                params: { boardId: board.id },
                              });
                            }}
                          >
                            <Settings className="text-muted-foreground" />
                            <span>
                              {t("navigation:boardList.boardSettings")}
                            </span>
                          </DropdownMenuItem>
                          {canDeleteBoard && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="h-7 items-start text-destructive cursor-pointer text-sm"
                                onClick={() => {
                                  setBoardToDeleteID(board.id);
                                  setIsDeleteBoardModalOpen(true);
                                }}
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
                  );
                })}

                {canCreate && (
                  <SidebarMenuItem className="mt-1">
                    <SidebarMenuButton
                      size="default"
                      className="h-8 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                      onClick={() => setIsCreateBoardModalOpen(true)}
                    >
                      <span>{t("navigation:boardList.addBoard")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsiblePanel>
        </SidebarGroup>
      </Collapsible>

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
