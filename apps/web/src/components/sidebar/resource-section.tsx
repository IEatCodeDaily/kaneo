import type { LucideIcon } from "lucide-react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  SIDEBAR_ACTIVE_PILL,
  SIDEBAR_SECTION_HEADER,
} from "@/hooks/use-sidebar-active";
import { cn } from "@/lib/cn";
import { intentPrefetchHandlers } from "@/lib/navigation-prefetch";
import type { HiddenSidebarEntry } from "../nav-hidden-items";
import { NavHiddenItems } from "../nav-hidden-items";
import { SidebarSortableItem, SidebarSortableList } from "../sidebar-sort";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";

/**
 * One generic sidebar resource section (Boards / Repos / Tables / Dashboards).
 *
 * Each nav section used to hand-roll the same skeleton — clickable header with
 * the ink-only treatment and section-fallback highlight, a + add action, the
 * item list with the shared active pill, per-item ⋯ + context menus, drag
 * reorder, and hide-from-sidebar persistence. This component owns that
 * skeleton; the per-section nav files keep only what is genuinely theirs:
 * data hooks, route wiring, and their own modals/dialogs.
 *
 * The per-section class treatments stay as literal strings in the maps below
 * (Tailwind cannot see dynamically-built class names), so a migrated section
 * renders pixel-identical to its hand-rolled predecessor.
 */
export type ResourceSectionId = "boards" | "repos" | "tables" | "dashboards";

const GROUP_CLASS: Record<ResourceSectionId, string> = {
  boards: "group/boards group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1",
  repos: "group/repos group-data-[collapsible=icon]:hidden gap-0.5 p-2 pt-1",
  tables: "group/tables gap-1 p-2 pt-1 group-data-[collapsible=icon]:hidden",
  dashboards:
    "group/dashboards gap-1 p-2 pt-1 group-data-[collapsible=icon]:hidden",
};

const HEADER_CLASS: Record<ResourceSectionId, string> = {
  boards: "h-7 flex-1 cursor-pointer px-0 pr-12",
  repos: "h-7 min-w-0 flex-1 cursor-pointer gap-2 px-0",
  tables: "h-7 min-w-0 flex-1 cursor-pointer gap-2 px-0",
  dashboards: "h-7 min-w-0 flex-1 cursor-pointer gap-2 px-0",
};

const ITEM_CLASS: Record<ResourceSectionId, string> = {
  boards: "h-8 gap-0 ps-3.5 text-sm",
  repos: "h-7 gap-0 ps-3.5 pe-8 text-sm",
  tables: "h-8 gap-2 ps-3.5 text-sm",
  dashboards: "h-8 gap-2 ps-3.5 text-sm",
};

const LABEL_CLASS: Record<ResourceSectionId, string> = {
  boards: "truncate",
  repos: "min-w-0 flex-1 truncate",
  tables: "truncate",
  dashboards: "min-w-0 flex-1 truncate",
};

const ADD_BUTTON_CLASS: Record<ResourceSectionId, string> = {
  boards:
    "flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/boards:opacity-100 group-hover/boards:opacity-100",
  repos:
    "flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/repos:opacity-100",
  tables:
    "flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/tables:opacity-100 group-hover/tables:opacity-100",
  dashboards:
    "flex size-6 items-center justify-center rounded-md text-sidebar-foreground opacity-0 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-focus-within/dashboards:opacity-100 group-hover/dashboards:opacity-100",
};

const ADD_ICON_CLASS: Record<ResourceSectionId, string> = {
  boards: "size-4",
  repos: "size-3.5",
  tables: "size-4",
  dashboards: "size-4",
};

const HIDDEN_MENU_TRIGGER_CLASS =
  "flex size-6 items-center justify-center rounded-md text-sidebar-foreground outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";

export type ResourceSectionItem = {
  /** Entity id — the drag and hide-persistence key. */
  id: string;
  label: string;
  /** Entity glyph: an EntityIcon, a provider avatar, or a lucide icon. */
  icon: ReactNode;
  active?: boolean;
  /** Collapsed-rail-style tooltip on the expanded row. */
  tooltip?: string;
  /** Count badges / trailing metadata after the label. */
  trailing?: ReactNode;
  /** Soft-deleted treatment: muted ink + strikethrough. */
  muted?: boolean;
  /** Clicking the row. */
  onSelect?: () => void;
  /** Hover/focus prefetch intent. */
  onIntent?: () => void;
};

export type ResourceSectionAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  /** Render a separator above this action. */
  separatorBefore?: boolean;
};

export type ResourceSectionProps = {
  id: ResourceSectionId;
  label: string;
  /** Stage badge (Alpha/Beta) rendered after the label. */
  headerBadge?: ReactNode;
  /** Section-fallback highlight: true when the route is ours but no visible item claims it. */
  sectionActive: boolean;
  onHeaderClick: () => void;
  /** The + add action; omit when the section has nothing to create. */
  addAction?: {
    label: string;
    onClick: () => void;
  };
  items: ResourceSectionItem[];
  /** Per-item ⋯ menu + right-click actions; omit for sections without menus. */
  actions?: (item: ResourceSectionItem) => ResourceSectionAction[];
  /** Accessible name for the per-item ⋯ trigger. */
  actionTriggerLabel?: string;
  /** Drag reorder wiring; omit for sections that do not reorder. */
  sortable?: { ids: string[]; onReorder: (ids: string[]) => void };
  /** Loading / error / empty slots rendered above the items. */
  loadingState?: ReactNode;
  errorState?: ReactNode;
  emptyState?: ReactNode;
  /** Items hidden from the list; enables the header ⋯ "Show" menu + "More …" row. */
  hiddenItems?: HiddenSidebarEntry[];
  /** Accessible name for the header ⋯ (hidden-items) trigger. */
  hiddenMenuLabel?: string;
  /** Label for a "Show {name}" entry in the header ⋯ menu. */
  hiddenShowLabel?: (name: string) => string;
  onShowHidden?: (id: string) => void;
  /** Label for the collapsible "More …" row (NavHiddenItems); omit to skip it. */
  moreHiddenLabel?: string;
  onHiddenSelect?: (id: string) => void;
  onHiddenIntent?: (id: string) => void;
  isHiddenActive?: (id: string) => boolean;
  /** Collapsed-rail group rendered before the expanded section (boards/repos). */
  collapsedRail?: ReactNode;
};

export function ResourceSection({
  id,
  label,
  headerBadge,
  sectionActive,
  onHeaderClick,
  addAction,
  items,
  actions,
  actionTriggerLabel,
  sortable,
  loadingState,
  errorState,
  emptyState,
  hiddenItems,
  hiddenMenuLabel,
  hiddenShowLabel,
  onShowHidden,
  moreHiddenLabel,
  onHiddenSelect,
  onHiddenIntent,
  isHiddenActive,
  collapsedRail,
}: ResourceSectionProps) {
  const { t } = useTranslation();
  const { isMobile } = useSidebar();
  const hasHiddenMenu = Boolean(hiddenItems?.length && onShowHidden);
  const list = (item: ResourceSectionItem) => {
    const itemActions = actions?.(item);
    const row = (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={item.active}
          className={`${ITEM_CLASS[id]} ${SIDEBAR_ACTIVE_PILL}`}
          onClick={item.onSelect}
          tooltip={item.tooltip}
          {...(item.onIntent
            ? intentPrefetchHandlers(() => item.onIntent?.())
            : {})}
        >
          {item.icon}
          <span
            className={cn(
              LABEL_CLASS[id],
              item.muted && "text-muted-foreground line-through",
            )}
          >
            {item.label}
          </span>
          {item.trailing}
        </SidebarMenuButton>
        {itemActions && itemActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  aria-label={actionTriggerLabel}
                  showOnHover
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-44 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align={isMobile ? "end" : "start"}
            >
              {itemActions.map((action) => (
                <Fragment key={action.label}>
                  {action.separatorBefore && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className={cn(
                      "h-7 items-start cursor-pointer text-sm",
                      action.destructive && "text-destructive",
                    )}
                    onClick={action.onSelect}
                  >
                    <action.icon
                      className={
                        action.destructive
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    />
                    <span>{action.label}</span>
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>
    );
    if (!itemActions || itemActions.length === 0) return row;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          {itemActions.map((action) => (
            <Fragment key={action.label}>
              {action.separatorBefore && <ContextMenuSeparator />}
              <ContextMenuItem
                className={cn(action.destructive && "text-destructive")}
                onClick={action.onSelect}
              >
                <action.icon
                  className={
                    action.destructive
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                />
                {action.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <>
      {collapsedRail}
      <SidebarGroup className={GROUP_CLASS[id]}>
        <div className="relative flex items-center">
          <SidebarGroupLabel
            className={`${HEADER_CLASS[id]} ${SIDEBAR_SECTION_HEADER}`}
            data-active={sectionActive}
            render={<button type="button" />}
            onClick={onHeaderClick}
          >
            <span>{label}</span>
            {headerBadge}
          </SidebarGroupLabel>
          {(addAction || hasHiddenMenu) && (
            <div className="absolute right-0 flex items-center">
              {addAction && (
                <button
                  type="button"
                  aria-label={addAction.label}
                  className={ADD_BUTTON_CLASS[id]}
                  onClick={addAction.onClick}
                >
                  <Plus className={ADD_ICON_CLASS[id]} />
                </button>
              )}
              {hasHiddenMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label={hiddenMenuLabel}
                        type="button"
                        className={HIDDEN_MENU_TRIGGER_CLASS}
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">
                      {t("navigation:sidebar.more")}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-lg">
                    {hiddenItems?.map((hidden) => (
                      <DropdownMenuItem
                        className="cursor-pointer text-sm"
                        key={hidden.id}
                        onClick={() => onShowHidden?.(hidden.id)}
                      >
                        {hiddenShowLabel
                          ? hiddenShowLabel(hidden.name)
                          : `Show ${hidden.name}`}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {loadingState}
            {errorState}
            {emptyState}
            {sortable ? (
              <SidebarSortableList
                ids={sortable.ids}
                onReorder={sortable.onReorder}
              >
                {items.map((item) => (
                  <SidebarSortableItem id={item.id} key={item.id}>
                    {list(item)}
                  </SidebarSortableItem>
                ))}
              </SidebarSortableList>
            ) : (
              items.map((item) => list(item))
            )}
            {moreHiddenLabel && hiddenItems && hiddenItems.length > 0 && (
              <NavHiddenItems
                isActive={isHiddenActive}
                items={hiddenItems}
                label={moreHiddenLabel}
                onIntent={onHiddenIntent}
                onSelect={onHiddenSelect ?? (() => {})}
                testIdPrefix={id}
              />
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

export default ResourceSection;
