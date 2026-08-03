import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TasksImportExport } from "@/components/board/tasks-import-export.tsx";
import EntityIcon from "@/components/common/entity-icon";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import icons from "@/constants/board-icons";
import useDeleteBoard from "@/hooks/mutations/board/use-delete-board";
import useUpdateBoard from "@/hooks/mutations/board/use-update-board";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import { isEmojiIcon } from "@/lib/resolve-icon";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board.ts";

/**
 * #171: a starter set of emoji for the board icon picker.
 *
 * Any emoji works — typing one into the search box offers it directly — but a
 * visible set makes the capability discoverable instead of hidden.
 */
const EMOJI_SUGGESTIONS = [
  "🚀",
  "🎯",
  "🐛",
  "🔥",
  "✨",
  "📦",
  "🧪",
  "🛠️",
  "📊",
  "🔐",
  "💡",
  "⚡",
];

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards/$boardId/general",
)({
  component: RouteComponent,
});

type BoardFormValues = {
  name: string;
  slug: string;
  description?: string;
  icon: string;
  subtaskDepthLimit: number;
};

type NormalizedBoardValues = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  subtaskDepthLimit: number;
};

function normalizeBoardValues(data: BoardFormValues): NormalizedBoardValues {
  return {
    name: data.name.trim(),
    slug: data.slug.trim(),
    description: (data.description ?? "").trim(),
    icon: data.icon || "Layout",
    subtaskDepthLimit: data.subtaskDepthLimit,
  };
}

function RouteComponent() {
  const { t } = useTranslation();
  const boardSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("settings:boardGeneral.validation.nameRequired"))
          .min(2, t("settings:boardGeneral.validation.nameShort")),
        slug: z
          .string()
          .min(1, t("settings:boardGeneral.validation.keyRequired"))
          .min(2, t("settings:boardGeneral.validation.keyShort"))
          .max(8, t("settings:boardGeneral.validation.keyMax")),
        description: z.string().optional(),
        icon: z
          .string()
          .min(1, t("settings:boardGeneral.validation.iconRequired")),
        subtaskDepthLimit: z.number().int().min(1).max(4),
      }),
    [t],
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef<BoardFormValues | null>(null);
  const lastSavedRef = useRef<NormalizedBoardValues | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  const { data: organization } = useActiveOrganization();
  const { boardId: rawBoardId } = useParams({ strict: false });
  const boardId = rawBoardId ?? "";
  const { data: fetchedBoard } = useGetTasks(boardId);
  const { board, setBoard } = useBoardStore();

  useEffect(() => {
    if (fetchedBoard) {
      setBoard(fetchedBoard);
    }
  }, [fetchedBoard, setBoard]);

  const { mutateAsync: updateBoard } = useUpdateBoard();
  const { mutateAsync: deleteBoard, isPending: isDeleting } = useDeleteBoard();
  const { canManageBoards, canDeleteBoards } = useOrganizationPermission();
  const canEdit = canManageBoards();
  const canDelete = canDeleteBoards();

  const boardForm = useForm<BoardFormValues>({
    resolver: standardSchemaResolver(boardSchema),
    mode: "onChange",
    defaultValues: {
      name: board?.name || "",
      slug: board?.slug || "",
      description: board?.description || "",
      icon: board?.icon || "Layout",
      subtaskDepthLimit: board?.subtaskDepthLimit ?? 4,
    },
  });

  useEffect(() => {
    if (!board) return;

    const nextValues = {
      name: board.name || "",
      slug: board.slug || "",
      description: board.description || "",
      icon: board.icon || "Layout",
      subtaskDepthLimit: board.subtaskDepthLimit ?? 4,
    };
    lastSavedRef.current = normalizeBoardValues(nextValues);

    if (boardForm.formState.isDirty) return;

    boardForm.reset(nextValues, {
      keepDirty: false,
      keepTouched: false,
      keepIsValid: true,
    });
  }, [board, boardForm]);

  const saveBoard = useCallback(
    async (data: BoardFormValues) => {
      if (!board?.id) return;

      const normalizedData = normalizeBoardValues(data);
      const nameChanged = lastSavedRef.current?.name !== normalizedData.name;
      const slugChanged = lastSavedRef.current?.slug !== normalizedData.slug;
      const descriptionChanged =
        lastSavedRef.current?.description !== normalizedData.description;
      const iconChanged = lastSavedRef.current?.icon !== normalizedData.icon;
      const subtaskDepthLimitChanged =
        lastSavedRef.current?.subtaskDepthLimit !==
        normalizedData.subtaskDepthLimit;
      const hasChanges =
        nameChanged ||
        slugChanged ||
        descriptionChanged ||
        iconChanged ||
        subtaskDepthLimitChanged;

      if (!hasChanges) return;

      if (isSavingRef.current) {
        queuedSaveRef.current = data;
        return;
      }

      isSavingRef.current = true;

      try {
        const updatePayload = {
          id: board.id,
          name: nameChanged ? normalizedData.name : board.name,
          slug: slugChanged ? normalizedData.slug : board.slug,
          description: descriptionChanged
            ? normalizedData.description
            : (board.description ?? ""),
          icon: iconChanged ? normalizedData.icon : (board.icon ?? "Layout"),
          isPublic: !!board.isPublic,
          subtaskDepthLimit: subtaskDepthLimitChanged
            ? normalizedData.subtaskDepthLimit
            : (board.subtaskDepthLimit ?? 4),
        };

        await updateBoard(updatePayload);

        boardForm.reset(normalizedData, { keepDirty: false });
        lastSavedRef.current = normalizedData;
        queuedSaveRef.current = null;

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["boards"] }),
          queryClient.invalidateQueries({
            queryKey: ["boards", organization?.id],
          }),
          queryClient.invalidateQueries({
            queryKey: ["boards", organization?.id, board.id],
          }),
        ]);
        toast.success(t("settings:boardGeneral.toastUpdated"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings:boardGeneral.toastUpdateError"),
        );
      } finally {
        isSavingRef.current = false;

        if (queuedSaveRef.current) {
          const queuedData = queuedSaveRef.current;
          queuedSaveRef.current = null;
          await saveBoard(queuedData);
        }
      }
    },
    [
      board?.id,
      board?.isPublic,
      board?.name,
      board?.slug,
      board?.description,
      board?.icon,
      board?.subtaskDepthLimit,
      updateBoard,
      queryClient,
      organization?.id,
      boardForm,
      t,
    ],
  );

  const saveBoardRef = useRef(saveBoard);
  const boardFormRef = useRef(boardForm);
  saveBoardRef.current = saveBoard;
  boardFormRef.current = boardForm;

  const debouncedSave = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      const isValid = await boardForm.trigger();
      if (isValid) {
        // Always save latest values to avoid staleness while typing
        const latest = boardForm.getValues();
        saveBoard(latest as BoardFormValues);
      }
    }, 800);
  }, [boardForm, saveBoard]);

  useEffect(() => {
    if (!canEdit) return;
    // Do not gate on formState.isDirty here: after setValue (e.g. icon pick), the
    // watch callback can run before RHF updates isDirty, so the debounced save never runs.
    const subscription = boardForm.watch(() => {
      debouncedSave();
    });

    return () => subscription.unsubscribe();
  }, [boardForm, debouncedSave, canEdit]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      // Flush pending edits if the user navigates away before the debounce fires.
      void (async () => {
        const latest = boardFormRef.current.getValues() as BoardFormValues;
        const normalized = normalizeBoardValues(latest);
        const last = lastSavedRef.current;
        const hasPendingChanges =
          !last ||
          last.name !== normalized.name ||
          last.slug !== normalized.slug ||
          last.description !== normalized.description ||
          last.icon !== normalized.icon ||
          last.subtaskDepthLimit !== normalized.subtaskDepthLimit;
        if (!hasPendingChanges) return;

        const isValid = await boardFormRef.current.trigger();
        if (isValid) {
          await saveBoardRef.current(latest);
        }
      })();
    };
  }, []);

  const handleDeleteBoard = useCallback(async () => {
    if (!board?.id) return;

    try {
      await deleteBoard({ id: board.id });
      toast.success(t("settings:boardGeneral.toastDeleted"));

      await queryClient.invalidateQueries({ queryKey: ["boards"] });

      navigate({
        to: "/dashboard/organization/$organizationId",
        params: { organizationId: organization?.id || "" },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:boardGeneral.toastDeleteError"),
      );
    }
  }, [board?.id, deleteBoard, queryClient, navigate, organization?.id, t]);

  return (
    <>
      <PageTitle title={t("settings:boardGeneral.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:boardGeneral.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:boardGeneral.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:boardGeneral.boardInfoTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:boardGeneral.boardInfoSubtitle")}
            </p>
          </div>

          <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:boardGeneral.iconLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardGeneral.iconHint")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Popover
                  open={iconPopoverOpen}
                  onOpenChange={(open) => {
                    setIconPopoverOpen(open);
                    if (!open) setIconSearch("");
                  }}
                  modal={true}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-auto justify-start gap-2 font-normal"
                      title={t("settings:boardGeneral.pickIconTitle")}
                      disabled={!canEdit}
                    >
                      <EntityIcon
                        className="h-4 w-4 text-base"
                        value={boardForm.watch("icon")}
                      />
                      <span className="truncate text-xs">
                        {boardForm.watch("icon") || "Layout"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <Input
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        placeholder={t(
                          "settings:boardGeneral.searchIconsPlaceholder",
                        )}
                        className="h-8 text-xs"
                      />
                      {/*
                        #171: an icon may also be an emoji. Typing or pasting one
                        into the search box offers it directly, so the whole
                        emoji space is available without shipping a picker.
                      */}
                      {isEmojiIcon(iconSearch) && (
                        <Button
                          className="h-10 w-full justify-start gap-2 text-xs"
                          onClick={() => {
                            boardForm.setValue("icon", iconSearch.trim(), {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            setIconPopoverOpen(false);
                            setIconSearch("");
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <span className="text-base leading-none">
                            {iconSearch.trim()}
                          </span>
                          {t("settings:boardGeneral.useEmoji")}
                        </Button>
                      )}
                      <div className="max-h-[280px] overflow-y-auto pr-1">
                        <div className="grid grid-cols-6 gap-1.5">
                          {EMOJI_SUGGESTIONS.filter(
                            () => !iconSearch.trim() || isEmojiIcon(iconSearch),
                          ).map((emoji) => {
                            const isSelected =
                              boardForm.getValues("icon") === emoji;
                            return (
                              <Button
                                className={cn(
                                  "h-10 items-center justify-center rounded-md p-0 text-base leading-none",
                                  isSelected &&
                                    "bg-sidebar-accent text-sidebar-accent-foreground",
                                )}
                                key={emoji}
                                onClick={() => {
                                  boardForm.setValue("icon", emoji, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  setIconPopoverOpen(false);
                                  setIconSearch("");
                                }}
                                size="sm"
                                title={emoji}
                                type="button"
                                variant="ghost"
                              >
                                {emoji}
                              </Button>
                            );
                          })}
                          {Object.entries(icons)
                            .filter(([iconName]) =>
                              iconName
                                .toLowerCase()
                                .includes(iconSearch.trim().toLowerCase()),
                            )
                            .map(([iconName, Icon]) => {
                              const isSelected =
                                boardForm.getValues("icon") === iconName;
                              return (
                                <Button
                                  key={iconName}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    boardForm.setValue("icon", iconName, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    });
                                    setIconPopoverOpen(false);
                                    setIconSearch("");
                                  }}
                                  className={cn(
                                    "h-10 items-center justify-center rounded-md p-0",
                                    isSelected &&
                                      "bg-sidebar-accent text-sidebar-accent-foreground",
                                  )}
                                  title={iconName}
                                >
                                  <Icon className="h-4 w-4" />
                                </Button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Separator />

            <Form {...boardForm}>
              <form className="space-y-4">
                <FormField
                  control={boardForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.boardNameLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.boardNameHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.boardNamePlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.keyLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.keyHint", {
                              slug: boardForm.watch("slug") || "ABC",
                            })}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.keyPlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="subtaskDepthLimit"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.subtaskDepthLimitLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.subtaskDepthLimitHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            aria-label={t(
                              "settings:boardGeneral.subtaskDepthLimitLabel",
                            )}
                            className="w-20 text-center"
                            disabled={!canEdit}
                            max={4}
                            min={1}
                            type="number"
                            {...field}
                            onChange={(event) =>
                              field.onChange(event.target.valueAsNumber)
                            }
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.descriptionLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.descriptionHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.descriptionPlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:boardGeneral.importExportTasks")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardGeneral.importExportTasksDescription")}
                </p>
              </div>
              {board && <TasksImportExport board={board} />}
            </div>
          </div>
        </div>

        {canDelete && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-md font-medium">
                {t("settings:boardGeneral.dangerZone")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings:boardGeneral.dangerZoneSubtitle")}
              </p>
            </div>

            <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:boardGeneral.deleteBoard")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:boardGeneral.deleteBoardDescription")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive transition-colors"
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={!board}
                >
                  {t("settings:boardGeneral.deleteBoard")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <AlertDialog
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings:boardGeneral.deleteModalTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings:boardGeneral.deleteModalDescription", {
                  name: board?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose>
                <Button variant="outline" size="sm">
                  {t("common:actions.cancel")}
                </Button>
              </AlertDialogClose>
              <AlertDialogClose
                onClick={handleDeleteBoard}
                disabled={isDeleting}
              >
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {isDeleting
                    ? t("common:actions.deleting")
                    : t("settings:boardGeneral.deleteModalConfirm")}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
