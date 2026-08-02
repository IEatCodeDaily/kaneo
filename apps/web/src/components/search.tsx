"use client";

import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import { SidebarGroup, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";

export default function Search() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  useRegisterShortcuts({
    shortcuts: {
      [shortcuts.search.prefix]: () => {
        setOpen(true);
      },
    },
  });

  /*
   * #96: collapsed, the search field morphs into a single icon button with a
   * hover tooltip — the bordered input plus its shortcut hint looked clipped
   * and unfinished in a 64px rail.
   */
  if (isCollapsed) {
    return (
      <SidebarGroup className="pb-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label={t("navigation:commandPalette.search")}
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  data-testid="sidebar-search-collapsed"
                  onClick={() => setOpen(true)}
                  type="button"
                >
                  <SearchIcon aria-hidden="true" size={16} />
                </button>
              }
            />
            <TooltipContent side="right">
              {t("navigation:commandPalette.search")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <SearchCommandMenu open={open} setOpen={setOpen} />
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="pb-1">
      <button
        className="inline-flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-foreground text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="flex grow items-center">
          <SearchIcon
            aria-hidden="true"
            className="-ms-1 me-3 text-muted-foreground/80"
            size={16}
          />
          <span className="font-normal text-muted-foreground/70">
            {t("navigation:commandPalette.search")}
          </span>
        </span>
        <kbd className="-me-0.5 ms-6 inline-flex h-4 max-h-full items-center rounded border border-border/70 bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground/60">
          {shortcuts.search.prefix}
        </kbd>
      </button>

      <SearchCommandMenu open={open} setOpen={setOpen} />
    </SidebarGroup>
  );
}
