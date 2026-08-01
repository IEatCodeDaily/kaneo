import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type PrincipalOption,
  PrincipalSelector,
} from "@/components/principal-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskFlag } from "@/fetchers/flag/get-task-flags";
import useCreateTaskFlag from "@/hooks/mutations/flag/use-create-task-flag";
import useResolveTaskFlag from "@/hooks/mutations/flag/use-resolve-task-flag";
import useGetBoardFlagTypes from "@/hooks/queries/flag/use-get-board-flag-types";
import useGetTaskFlags from "@/hooks/queries/flag/use-get-task-flags";
import { cn } from "@/lib/cn";
import { getFlagColor, getFlagIcon } from "./flag-icon";

type TaskFlagPickerProps = {
  taskId: string;
  boardId: string;
  principals: PrincipalOption[];
  principalsLoading?: boolean;
  disabled?: boolean;
};

/**
 * #107: the flag control is a milestone-style popover, not a modal. Flag type
 * is a row of colour-coded icon chips (a simple selector, no dropdown), and
 * the target uses the same PrincipalSelector as board visibility so there is
 * exactly one member/team selector in the product.
 */
export default function TaskFlagPicker({
  taskId,
  boardId,
  principals,
  principalsLoading = false,
  disabled = false,
}: TaskFlagPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [flagTypeId, setFlagTypeId] = useState("");
  const [target, setTarget] = useState<PrincipalOption[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: flagTypes = [] } = useGetBoardFlagTypes(boardId);
  const { data: flags = [] } = useGetTaskFlags(taskId);
  const { mutate: createTaskFlag, isPending: isRaising } = useCreateTaskFlag();
  const { mutate: resolveTaskFlag } = useResolveTaskFlag();

  const activeFlags = useMemo(
    () => (flags as TaskFlag[]).filter((flag) => !flag.resolvedAt),
    [flags],
  );
  const primary = activeFlags[0];
  const TriggerIcon = getFlagIcon(primary?.flagTypeIcon);
  const triggerColor = primary
    ? getFlagColor(primary.flagTypeColor)
    : undefined;

  const reset = () => {
    setFlagTypeId("");
    setTarget([]);
    setNote("");
    setError(null);
  };

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    setError(null);

    if (!flagTypeId) {
      setError(t("flags:dialog.errors.noType"));
      return;
    }

    const selected = target[0];
    if (!selected) {
      setError(t("flags:dialog.errors.noTarget"));
      return;
    }

    createTaskFlag({
      taskId,
      flagTypeId,
      targetUserId: selected.kind === "member" ? selected.id : null,
      targetTeamId: selected.kind === "team" ? selected.id : null,
      note: note || null,
    });

    reset();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          data-testid="task-flag-trigger"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={t("flags:title")}
          className="h-7 gap-1.5 px-1.5 justify-start"
        >
          <TriggerIcon className="size-4 shrink-0" />
          <span
            className="text-xs font-semibold truncate"
            style={triggerColor ? { color: triggerColor } : undefined}
          >
            {primary ? primary.flagTypeName : t("flags:title")}
          </span>
          {activeFlags.length > 1 && (
            <span className="text-[10px] text-muted-foreground">
              +{activeFlags.length - 1}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3">
          <span className="text-xs font-medium text-foreground/70">
            {t("flags:dialog.type")}
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            data-testid="flag-type-options"
          >
            {flagTypes.map((flagType) => {
              const Icon = getFlagIcon(flagType.icon);
              const color = getFlagColor(flagType.color);
              const selected = flagTypeId === flagType.id;
              return (
                <button
                  key={flagType.id}
                  type="button"
                  aria-pressed={selected}
                  data-testid={`flag-type-${flagType.id}`}
                  onClick={() => setFlagTypeId(flagType.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    selected ? "border-transparent" : "border-border",
                  )}
                  style={
                    selected
                      ? { backgroundColor: `${color}1f`, color }
                      : { color }
                  }
                >
                  <Icon className="size-3.5" />
                  {flagType.name}
                </button>
              );
            })}
          </div>

          <span className="mt-1 text-xs font-medium text-foreground/70">
            {t("flags:dialog.targetUser")}
          </span>
          <PrincipalSelector
            aria-label={t("flags:dialog.targetUser")}
            className="h-8 w-full"
            loading={principalsLoading}
            options={principals}
            value={target}
            onValueChange={setTarget}
            placeholder={t("flags:dialog.noUser")}
          />

          <Input
            aria-label={t("flags:dialog.note")}
            placeholder={t("flags:dialog.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-8"
          />

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="sm" disabled={isRaising}>
            {t("flags:dialog.submit")}
          </Button>
        </form>

        {activeFlags.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border p-3">
            <span className="text-xs font-medium text-foreground/70">
              {t("flags:dialog.activeTitle")}
            </span>
            {activeFlags.map((flag) => {
              const Icon = getFlagIcon(flag.flagTypeIcon);
              const color = getFlagColor(flag.flagTypeColor);
              return (
                <div key={flag.id} className="flex items-center gap-2">
                  <Icon className="size-3.5 shrink-0" style={{ color }} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {flag.flagTypeName}
                    {flag.targetUserName || flag.targetTeamName
                      ? ` · ${flag.targetUserName ?? flag.targetTeamName}`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs"
                    data-testid={`flag-unflag-${flag.id}`}
                    onClick={() => resolveTaskFlag({ flagId: flag.id, taskId })}
                  >
                    {t("flags:dialog.unflag")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
