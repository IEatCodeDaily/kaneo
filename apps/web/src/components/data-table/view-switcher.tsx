import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  createTableView,
  deleteTableView,
  updateTableView,
} from "@/fetchers/data-table/data-table";
import { toast } from "@/lib/toast";
import type { DataTableTarget } from "@/types/data-table";
import type { SavedTableView } from "./saved-view-layout";

export function ViewSwitcher({
  views,
  current,
  target,
  canEdit,
  onSelect,
  onRefresh,
  flush,
  saveError,
}: {
  views: SavedTableView[];
  current?: SavedTableView;
  target: DataTableTarget;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => Promise<unknown>;
  flush: () => Promise<boolean>;
  saveError: boolean;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<
    "create" | "rename" | "duplicate" | "delete" | null
  >(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (key: string) => t(`navigation:tables.savedViews.${key}`);
  const open = (next: typeof action) => {
    setName(next === "rename" ? (current?.name ?? "") : "");
    setAction(next);
  };
  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      if (!(await flush())) throw new Error("Unsaved layout");
      let nextId: string | undefined;
      if (action === "delete" && current)
        await deleteTableView(target, current.id);
      else if (action === "rename" && current)
        await updateTableView(target, current.id, { name: name.trim() });
      else
        nextId = (
          await createTableView(target, {
            name: name.trim(),
            ...(action === "duplicate" ? { duplicateFrom: current?.id } : {}),
          })
        ).id;
      await onRefresh();
      if (nextId) onSelect(nextId);
      else if (action === "delete") {
        const fallback = views.find((v) => v.id !== current?.id);
        if (fallback) onSelect(fallback.id);
      }
      setAction(null);
    } catch {
      toast.error(label("error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="hidden min-w-0 shrink-0 items-center gap-1 @3xl/toolbar:flex">
      {/* Toolbar-resident control: collapses together with the toolbar
          labels (@3xl/toolbar), so narrow toolbars never clip. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="max-w-32"
              aria-label={label("switch")}
            />
          }
        >
          <span className="truncate">{current?.name ?? label("title")}</span>
          <ChevronDown className="size-3 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            {views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                aria-current={view.id === current?.id ? "true" : undefined}
                onClick={async () => {
                  if (await flush()) onSelect(view.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{view.name}</span>
                {view.isDefault && (
                  <span className="text-xs text-muted-foreground">
                    {label("default")}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => open("create")}>
                  {label("create")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {canEdit && current && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={label("options")}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => open("rename")}>
                {label("rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => open("duplicate")}>
                {label("duplicate")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="text-destructive-foreground data-highlighted:text-destructive-foreground"
                disabled={views.length <= 1}
                onClick={() => open("delete")}
              >
                {label("delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {saveError && (
        <Button variant="destructive" size="xs" onClick={() => void flush()}>
          {label("retry")}
        </Button>
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{label(action ?? "title")}</DialogTitle>
            </DialogHeader>
            {action === "delete" ? (
              <p className="text-sm">{label("deleteConfirm")}</p>
            ) : (
              <Input
                autoFocus
                aria-label={label("name")}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {t("navigation:tables.cancel")}
              </Button>
              <Button
                type="submit"
                variant={action === "delete" ? "destructive" : "default"}
                disabled={busy || (action !== "delete" && !name.trim())}
              >
                {label(action ?? "create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
