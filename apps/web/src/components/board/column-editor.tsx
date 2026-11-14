import { Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import columnIcons, {
  DEFAULT_COLUMN_ICON_NAMES,
} from "@/constants/column-icons";
import {
  STATUS_TYPES,
  type StatusType,
  sortStatuses,
} from "@/constants/task-statuses";
import { useCreateColumn } from "@/hooks/mutations/column/use-create-column";
import { useDeleteColumn } from "@/hooks/mutations/column/use-delete-column";
import { useReorderColumns } from "@/hooks/mutations/column/use-reorder-columns";
import { useUpdateColumn } from "@/hooks/mutations/column/use-update-column";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getColumnIcon } from "@/lib/column";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ColumnEditorProps = {
  boardId: string;
};

const TYPE_LABEL_KEY: Record<StatusType, string> = {
  triage: "settings:columnEditor.typeTriage",
  backlog: "settings:columnEditor.typeBacklog",
  unstarted: "settings:columnEditor.typeUnstarted",
  started: "settings:columnEditor.typeStarted",
  completed: "settings:columnEditor.typeCompleted",
  canceled: "settings:columnEditor.typeCanceled",
  duplicate: "settings:columnEditor.typeDuplicate",
};

const CLOSED_TYPES: readonly StatusType[] = [
  "completed",
  "canceled",
  "duplicate",
];

/**
 * The board's Status settings. Every status is a board row, grouped under its
 * TYPE (Triage → Duplicate). Each group adds its own custom statuses; rows
 * drag within their group only (changing type is the explicit selector);
 * the eye toggles whether a status is a Kanban lane or lives on the Backlog
 * page.
 */
export default function ColumnEditor({ boardId }: ColumnEditorProps) {
  const { t } = useTranslation();
  const { data: columns, isLoading } = useGetColumns(boardId);
  const { mutateAsync: createColumn } = useCreateColumn();
  const { mutateAsync: updateColumn } = useUpdateColumn();
  const { mutateAsync: deleteColumn } = useDeleteColumn();
  const { mutateAsync: reorderColumns } = useReorderColumns();
  const { canManageBoards } = useOrganizationPermission();
  const canEdit = canManageBoards();
  const [newName, setNewName] = useState<Partial<Record<StatusType, string>>>(
    {},
  );
  const [addingType, setAddingType] = useState<StatusType | null>(null);
  const [iconPickerColumnId, setIconPickerColumnId] = useState<string | null>(
    null,
  );
  const [iconSearch, setIconSearch] = useState("");
  const [dragged, setDragged] = useState<{
    type: StatusType;
    index: number;
  } | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      dragPreviewRef.current?.remove();
    };
  }, []);

  const groups = STATUS_TYPES.map((type) => ({
    type,
    statuses: sortStatuses(
      (columns ?? []).filter((column) => column.statusType === type),
    ),
  }));

  const run = async (
    action: () => Promise<unknown>,
    successKey: string,
    errorKey: string,
  ) => {
    try {
      await action();
      toast.success(t(successKey));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(errorKey));
      return false;
    }
  };

  const handleCreate = async (type: StatusType) => {
    const name = newName[type]?.trim();
    if (!name) return;
    const ok = await run(
      () => createColumn({ boardId, data: { name, statusType: type } }),
      "settings:columnEditor.toastCreated",
      "settings:columnEditor.toastCreateError",
    );
    if (ok) {
      setNewName((prev) => ({ ...prev, [type]: "" }));
      setAddingType(null);
    }
  };

  const handleUpdate = (
    id: string,
    data: Parameters<typeof updateColumn>[0]["data"],
    successKey: string,
  ) =>
    run(
      () => updateColumn({ id, boardId, data }),
      successKey,
      "settings:columnEditor.toastUpdateError",
    );

  const handleDelete = (id: string) =>
    run(
      () => deleteColumn({ id, boardId }),
      "settings:columnEditor.toastDeleted",
      "settings:columnEditor.toastDeleteError",
    );

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    type: StatusType,
    index: number,
  ) => {
    setDragged({ type, index });
    dragPreviewRef.current?.remove();

    // Isolated clone so the drag image only captures the selected row.
    const sourceElement = e.currentTarget;
    const sourceRect = sourceElement.getBoundingClientRect();
    const dragPreview = sourceElement.cloneNode(true) as HTMLDivElement;
    dragPreview.setAttribute("aria-hidden", "true");
    dragPreview.inert = true;
    Object.assign(dragPreview.style, {
      position: "fixed",
      top: "-10000px",
      left: "-10000px",
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      margin: "0",
      boxSizing: "border-box",
      overflow: "hidden",
      pointerEvents: "none",
      transform: "none",
      contain: "layout paint",
    });
    document.body.appendChild(dragPreview);
    dragPreviewRef.current = dragPreview;

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.setDragImage(
      dragPreview,
      e.clientX - sourceRect.left,
      e.clientY - sourceRect.top,
    );
  };

  // Drag reorders WITHIN a type group only; positions are per type.
  const handleDragOver = (
    e: React.DragEvent,
    type: StatusType,
    index: number,
  ) => {
    if (!dragged || dragged.type !== type) return;
    e.preventDefault();
    if (dragged.index === index) return;
    const group = groups.find((g) => g.type === type)?.statuses ?? [];
    const reordered = [...group];
    const [removed] = reordered.splice(dragged.index, 1);
    reordered.splice(index, 0, removed);
    reorderColumns({
      boardId,
      columns: reordered.map((col, i) => ({ id: col.id, position: i })),
    });
    setDragged({ type, index });
  };

  const handleDragEnd = () => {
    setDragged(null);
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
  };

  const filteredIcons = Object.entries(columnIcons).filter(([iconName]) =>
    iconName.toLowerCase().includes(iconSearch.trim().toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("settings:columnEditor.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ type, statuses }) => (
        <section
          key={type}
          className="space-y-1"
          data-testid={`status-group-${type}`}
          aria-label={t(TYPE_LABEL_KEY[type])}
        >
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(TYPE_LABEL_KEY[type])}
              </h3>
              {CLOSED_TYPES.includes(type) && (
                <span className="rounded-sm border border-border px-1 text-xs text-muted-foreground">
                  {t("settings:columnEditor.closesTicket")}
                </span>
              )}
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                onClick={() => setAddingType(type)}
                data-testid={`status-add-${type}`}
              >
                <Plus className="size-3.5" />
                {t("settings:columnEditor.addStatus")}
              </Button>
            )}
          </div>

          {statuses.map((col, index) => (
            // biome-ignore lint/a11y/useSemanticElements: false positive for role="listitem"
            <div
              key={col.id}
              role="listitem"
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, type, index)}
              onDragOver={(e) => handleDragOver(e, type, index)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-2 rounded-md border border-border bg-sidebar p-2 transition-colors hover:bg-sidebar-accent/50"
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <Popover
                open={iconPickerColumnId === col.id}
                onOpenChange={(open) => {
                  setIconPickerColumnId(open ? col.id : null);
                  if (!open) setIconSearch("");
                }}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 p-0"
                    title={t("settings:columnEditor.pickIconTitle")}
                    disabled={!canEdit}
                  >
                    {getColumnIcon(col.slug, col.isFinal, col.icon)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-2">
                    <Input
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      placeholder={t(
                        "settings:columnEditor.searchIconsPlaceholder",
                      )}
                      className="h-8 text-xs"
                    />
                    <div className="max-h-[280px] overflow-y-auto pr-1">
                      <div className="grid grid-cols-6 gap-1.5">
                        {filteredIcons.map(([iconName, Icon]) => {
                          const selectedIconName =
                            col.icon ||
                            DEFAULT_COLUMN_ICON_NAMES[
                              col.slug as keyof typeof DEFAULT_COLUMN_ICON_NAMES
                            ];
                          return (
                            <Button
                              key={iconName}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const ok = await handleUpdate(
                                  col.id,
                                  { icon: iconName },
                                  "settings:columnEditor.toastIconUpdated",
                                );
                                if (ok) {
                                  setIconPickerColumnId(null);
                                  setIconSearch("");
                                }
                              }}
                              className={cn(
                                "h-10 items-center justify-center rounded-md p-0",
                                selectedIconName === iconName &&
                                  "bg-sidebar-accent text-sidebar-accent-foreground",
                              )}
                              title={iconName}
                            >
                              <Icon className="size-4" />
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                defaultValue={col.name}
                className="h-8 w-full max-w-56 text-sm"
                disabled={!canEdit}
                aria-label={t("settings:columnEditor.statusNameAria")}
                onBlur={(e) => {
                  if (e.target.value !== col.name) {
                    void handleUpdate(
                      col.id,
                      { name: e.target.value },
                      "settings:columnEditor.toastRenamed",
                    );
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
              <span className="hidden min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground sm:inline">
                {col.slug}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "size-7 p-0",
                    col.showOnBoard
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                  disabled={!canEdit}
                  aria-pressed={col.showOnBoard}
                  aria-label={t("settings:columnEditor.showOnBoardAria", {
                    name: col.name,
                  })}
                  title={t(
                    col.showOnBoard
                      ? "settings:columnEditor.shownOnBoard"
                      : "settings:columnEditor.hiddenFromBoard",
                  )}
                  data-testid={`status-show-on-board-${col.slug}`}
                  onClick={() =>
                    void handleUpdate(
                      col.id,
                      { showOnBoard: !col.showOnBoard },
                      "settings:columnEditor.toastVisibilityUpdated",
                    )
                  }
                >
                  {col.showOnBoard ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                </Button>
                <Select
                  value={col.statusType}
                  onValueChange={
                    canEdit
                      ? (next) => {
                          if (next && next !== col.statusType) {
                            void handleUpdate(
                              col.id,
                              { statusType: next as StatusType },
                              "settings:columnEditor.toastTypeUpdated",
                            );
                          }
                        }
                      : undefined
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger
                    aria-label={t("settings:columnEditor.statusTypeAria", {
                      name: col.name,
                    })}
                    title={t("settings:columnEditor.statusTypeTooltip")}
                    size="sm"
                    className="h-8 w-[118px] text-xs"
                  >
                    <SelectValue>
                      {t(TYPE_LABEL_KEY[col.statusType as StatusType])}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(TYPE_LABEL_KEY[option])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={t("settings:columnEditor.deleteStatusAria", {
                      name: col.name,
                    })}
                    onClick={() => void handleDelete(col.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {canEdit && addingType === type && (
            <div className="flex items-center gap-2 pl-6">
              <Input
                autoFocus
                placeholder={t("settings:columnEditor.newStatusPlaceholder", {
                  type: t(TYPE_LABEL_KEY[type]),
                })}
                value={newName[type] ?? ""}
                onChange={(e) =>
                  setNewName((prev) => ({ ...prev, [type]: e.target.value }))
                }
                className="h-8 w-full max-w-56 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate(type);
                  if (e.key === "Escape") setAddingType(null);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCreate(type)}
                disabled={!newName[type]?.trim()}
                className="h-8 gap-1"
              >
                <Plus className="size-3.5" />
                {t("settings:columnEditor.add")}
              </Button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
