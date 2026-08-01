import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PrincipalSelector, type PrincipalOption } from "@/components/principal-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskFlag } from "@/fetchers/flag/get-task-flags";
import useCreateTaskFlag from "@/hooks/mutations/flag/use-create-task-flag";
import useResolveTaskFlag from "@/hooks/mutations/flag/use-resolve-task-flag";
import useGetBoardFlagTypes from "@/hooks/queries/flag/use-get-board-flag-types";
import useGetTaskFlags from "@/hooks/queries/flag/use-get-task-flags";
import FlagBadge from "./flag-badge";

export type FlagTarget = {
  id: string;
  name: string;
};

type FlagDialogProps = {
  taskId: string;
  boardId: string;
  users?: FlagTarget[];
  teams?: FlagTarget[];
  onClose?: () => void;
};

/**
 * Raise / resolve flags for a task.
 *
 * The API demands EXACTLY ONE of targetUserId / targetTeamId; we mirror that
 * rule here so a user never round-trips into a 400.
 */
export function FlagDialog({
  taskId,
  boardId,
  users = [],
  teams = [],
  onClose,
}: FlagDialogProps) {
  const { t } = useTranslation();
  const [flagTypeId, setFlagTypeId] = useState("");
  const [target, setTarget] = useState<PrincipalOption[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: flagTypes = [] } = useGetBoardFlagTypes(boardId);
  const { data: flags = [] } = useGetTaskFlags(taskId, true);
  const { mutate: createTaskFlag } = useCreateTaskFlag();
  const { mutate: resolveTaskFlag } = useResolveTaskFlag();

  const allFlags = flags as TaskFlag[];
  const activeFlags = allFlags.filter((flag) => !flag.resolvedAt);
  const resolvedFlags = allFlags.filter((flag) => flag.resolvedAt);

  const handleSubmit = (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    setError(null);

    if (!flagTypeId) {
      setError(t("flags:dialog.errors.noType"));
      return;
    }

    const selectedTarget = target[0];

    if (!selectedTarget) {
      setError(t("flags:dialog.errors.noTarget"));
      return;
    }

    createTaskFlag({
      taskId,
      flagTypeId,
      targetUserId: selectedTarget.kind === "member" ? selectedTarget.id : null,
      targetTeamId: selectedTarget.kind === "team" ? selectedTarget.id : null,
      note: note || null,
    });

    setFlagTypeId("");
    setTarget([]);
    setNote("");
    onClose?.();
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs">
          {t("flags:dialog.type")}
          <select
            aria-label={t("flags:dialog.type")}
            value={flagTypeId}
            onChange={(event) => setFlagTypeId(event.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">{t("flags:dialog.selectType")}</option>
            {flagTypes.map((flagType) => (
              <option key={flagType.id} value={flagType.id}>
                {flagType.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-xs font-medium">
          <span>{t("flags:dialog.targetUser")}</span>
          <PrincipalSelector
            aria-label={t("flags:dialog.targetUser")}
            className="h-9 w-full"
            options={[
              ...users.map((item) => ({ ...item, kind: "member" as const })),
              ...teams.map((item) => ({ ...item, kind: "team" as const })),
            ]}
            value={target}
            onValueChange={setTarget}
            placeholder={t("flags:dialog.noUser")}
          />
        </div>

        <label className="flex flex-col gap-1 text-xs">
          {t("flags:dialog.note")}
          <Input
            aria-label={t("flags:dialog.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-9"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit">
          {t("flags:dialog.submit")}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground/70">
          {t("flags:dialog.activeTitle")}
        </span>
        {activeFlags.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("flags:dialog.noneActive")}
          </p>
        )}
        {activeFlags.map((flag) => (
          <div key={flag.id} className="flex items-center gap-2">
            <FlagBadge flag={flag} />
            <span className="text-xs text-muted-foreground">
              {t("flags:dialog.raisedBy", {
                who: flag.flaggedByName ?? "",
                target: flag.targetUserName ?? flag.targetTeamName ?? "",
              })}
            </span>
            <button
              type="button"
              onClick={() => resolveTaskFlag({ flagId: flag.id, taskId })}
              className="rounded border border-border px-1.5 py-0.5 text-xs"
            >
              {t("flags:dialog.unflag")}
            </button>
          </div>
        ))}
      </div>

      {resolvedFlags.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-foreground/70">
            {t("flags:dialog.historyTitle")}
          </span>
          {resolvedFlags.map((flag) => (
            <div key={flag.id} className="flex items-center gap-2">
              <FlagBadge flag={flag} />
              <span className="text-xs text-muted-foreground">
                {t("flags:dialog.resolvedBy", {
                  who: flag.resolvedByName ?? "",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FlagDialog;
