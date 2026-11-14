import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getSearchResultIcon,
  type SearchResultItem,
  useSearchResults,
} from "@/components/search-command-menu";
import CreateOrganizationModal from "@/components/shared/modals/create-organization-modal";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useCommandPaletteStore } from "@/store/command-palette";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { openKeyboardShortcutsHelp } from "../keyboard-shortcuts-help";
import CreateBoardModal from "../shared/modals/create-board-modal";
import { getOrganizationMembersRoute } from "./members-route";

type PaletteActionItem = {
  value: string;
  label: string;
  shortcut?: string;
  onRun: () => void;
};

type PaletteActionGroup = {
  kind: "actions";
  value: string;
  label: string;
  items: PaletteActionItem[];
};

type PaletteSearchGroup = {
  kind: "search";
  value: string;
  label: string;
  items: SearchResultItem[];
};

type PaletteGroup = PaletteActionGroup | PaletteSearchGroup;

function matchesQuery(label: string, query: string) {
  const haystack = label.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function CommandPalette() {
  const { t } = useTranslation();
  const { setTheme } = useUserPreferencesStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const open = useCommandPaletteStore((state) => state.open);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const togglePalette = useCommandPaletteStore((state) => state.toggle);
  const [query, setQuery] = useState("");
  const {
    groups: searchGroups,
    openResult,
    searchEnabled,
  } = useSearchResults(query);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] =
    useState(false);
  const { boardId: resolvedRouteBoardId } = useBoardSlug();
  const boardIdFromRoute = resolvedRouteBoardId || undefined;
  const isBacklogView = location.pathname.endsWith("/backlog");

  useRegisterShortcuts({
    shortcuts: {
      [shortcuts.help.key]: () => {
        openKeyboardShortcutsHelp();
      },
      // `/` and Ctrl/⌘+K are the same palette: commands + global search.
      [shortcuts.search.prefix]: () => {
        setOpen(true);
      },
    },
    modifierShortcuts: {
      [shortcuts.palette.prefix]: {
        [shortcuts.palette.open]: togglePalette,
      },
    },
    sequentialShortcuts: {
      [shortcuts.board.prefix]: {
        [shortcuts.board.list]: () => {
          if (!organization?.slug) return;
          navigate({
            to: "/dashboard/organization/$organizationSlug",
            params: { organizationSlug: organization.slug },
          });
        },
        [shortcuts.board.create]: () => setIsCreateBoardOpen(true),
      },
      [shortcuts.task.prefix]: {
        [shortcuts.task.create]: () => setIsCreateTaskOpen(true),
      },
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.create]: () => {
          setIsCreateOrganizationOpen(true);
        },
      },
    },
  });

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const runCommand = useCallback(
    (command: () => void) => {
      command();
      setOpen(false);
    },
    [setOpen],
  );

  const actionGroups = useMemo<PaletteActionGroup[]>(
    () => [
      {
        kind: "actions",
        value: "suggestions",
        label: t("navigation:commandPalette.suggestions"),
        items: [
          {
            value: "boards",
            label: t("navigation:commandPalette.boards"),
            shortcut: `${shortcuts.board.prefix} ${shortcuts.board.list}`,
            onRun: () => {
              if (!organization?.slug) return;
              navigate({
                to: "/dashboard/organization/$organizationSlug",
                params: { organizationSlug: organization.slug },
              });
            },
          },
          {
            value: "members",
            label: t("navigation:commandPalette.members", {
              defaultValue: "Members",
            }),
            onRun: () => {
              if (!organization?.slug) return;
              navigate(getOrganizationMembersRoute(organization.slug));
            },
          },
          {
            value: "create-task",
            label: t("navigation:commandPalette.createTask"),
            shortcut: `${shortcuts.task.prefix} ${shortcuts.task.create}`,
            onRun: () => setIsCreateTaskOpen(true),
          },
          {
            value: "create-board",
            label: t("navigation:commandPalette.createBoard"),
            shortcut: `${shortcuts.board.prefix} ${shortcuts.board.create}`,
            onRun: () => setIsCreateBoardOpen(true),
          },
        ],
      },
      {
        kind: "actions",
        value: "commands",
        label: t("navigation:commandPalette.commands"),
        items: [
          {
            value: "create-organization",
            label: t("navigation:commandPalette.createOrganization"),
            shortcut: `${shortcuts.organization.prefix} ${shortcuts.organization.create}`,
            onRun: () => setIsCreateOrganizationOpen(true),
          },
          {
            value: "theme-light",
            label: t("navigation:commandPalette.lightTheme"),
            onRun: () => setTheme("light"),
          },
          {
            value: "theme-dark",
            label: t("navigation:commandPalette.darkTheme"),
            onRun: () => setTheme("dark"),
          },
          {
            value: "theme-system",
            label: t("navigation:commandPalette.systemTheme"),
            onRun: () => setTheme("system"),
          },
          {
            value: "keyboard-shortcuts",
            label: t("navigation:commandPalette.keyboardShortcuts"),
            shortcut: "?",
            onRun: () => {
              setTimeout(() => {
                openKeyboardShortcutsHelp();
              }, 100);
            },
          },
        ],
      },
    ],
    [navigate, setTheme, t, organization?.slug],
  );

  const groupedItems = useMemo<PaletteGroup[]>(() => {
    const trimmed = query.trim();
    const filteredActions = trimmed
      ? actionGroups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
              matchesQuery(item.label, trimmed),
            ),
          }))
          .filter((group) => group.items.length > 0)
      : actionGroups;
    const results: PaletteSearchGroup[] = searchGroups.map((group) => ({
      kind: "search",
      ...group,
    }));
    // Typing is almost always a search: results first, matching commands after.
    return trimmed ? [...results, ...filteredActions] : filteredActions;
  }, [actionGroups, query, searchGroups]);

  const emptyMessage =
    !query.trim() || searchEnabled
      ? t("navigation:commandPalette.empty")
      : t("navigation:search.minCharsHint");

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup instant>
          <Command
            items={groupedItems}
            mode="none"
            onValueChange={setQuery}
            value={query}
          >
            <CommandInput
              placeholder={t("navigation:search.inputPlaceholder")}
            />
            <CommandPanel>
              <CommandEmpty>
                <p className="text-center text-muted-foreground text-sm">
                  {emptyMessage}
                </p>
              </CommandEmpty>
              <CommandList>
                {(group: PaletteGroup, groupIndex: number) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.label}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: PaletteActionItem | SearchResultItem) => {
                          if (group.kind === "search") {
                            const result = item as SearchResultItem;
                            const Icon = getSearchResultIcon(result.type);
                            return (
                              <CommandItem
                                key={`${result.type}-${result.id}`}
                                value={`${result.type}-${result.id}`}
                                onClick={() =>
                                  runCommand(() => openResult(result))
                                }
                                className="flex items-start gap-3 py-2.5"
                                aria-label={`${result.type}: ${result.title}`}
                              >
                                <Icon
                                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-sm">
                                    {result.title}
                                  </div>
                                  {result.description && (
                                    <div className="mt-1 truncate text-muted-foreground text-xs">
                                      {result.description}
                                    </div>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          }
                          const action = item as PaletteActionItem;
                          return (
                            <CommandItem
                              key={action.value}
                              value={action.value}
                              onClick={() => runCommand(action.onRun)}
                              className="px-3"
                            >
                              <span className="flex-1">{action.label}</span>
                              {action.shortcut && (
                                <CommandShortcut>
                                  {action.shortcut}
                                </CommandShortcut>
                              )}
                            </CommandItem>
                          );
                        }}
                      </CommandCollection>
                    </CommandGroup>
                    {groupIndex < groupedItems.length - 1 && (
                      <CommandSeparator />
                    )}
                  </Fragment>
                )}
              </CommandList>
            </CommandPanel>
            <CommandFooter>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <ArrowUpIcon />
                    </Kbd>
                    <Kbd>
                      <ArrowDownIcon />
                    </Kbd>
                  </KbdGroup>
                  <span>{t("navigation:commandPalette.footer.navigate")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Kbd>
                    <CornerDownLeftIcon />
                  </Kbd>
                  <span>{t("navigation:commandPalette.footer.open")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <span>{t("navigation:commandPalette.footer.close")}</span>
              </div>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>

      <CreateTaskModal
        open={isCreateTaskOpen}
        boardId={boardIdFromRoute}
        status={isBacklogView ? "planned" : undefined}
        onClose={() => setIsCreateTaskOpen(false)}
      />
      <CreateOrganizationModal
        open={isCreateOrganizationOpen}
        onClose={() => setIsCreateOrganizationOpen(false)}
      />
      <CreateBoardModal
        open={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
      />
    </>
  );
}

export default CommandPalette;
