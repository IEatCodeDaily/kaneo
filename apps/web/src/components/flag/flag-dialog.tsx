import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const [targetUserId, setTargetUserId] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
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

    const hasUser = Boolean(targetUserId);
    const hasTeam = Boolean(targetTeamId);

    if (hasUser && hasTeam) {
      setError(t("flags:dialog.errors.bothTargets"));
      return;
    }

    if (!hasUser && !hasTeam) {
      setError(t("flags:dialog.errors.noTarget"));
      return;
    }

    createTaskFlag({
      taskId,
      flagTypeId,
      targetUserId: hasUser ? targetUserId : null,
      targetTeamId: hasTeam ? targetTeamId : null,
      note: note || null,
    });

    setFlagTypeId("");
    setTargetUserId("");
    setTargetTeamId("");
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

        <label className="flex flex-col gap-1 text-xs">
          {t("flags:dialog.targetUser")}
          <select
            aria-label={t("flags:dialog.targetUser")}
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">{t("flags:dialog.noUser")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          {t("flags:dialog.targetTeam")}
          <select
            aria-label={t("flags:dialog.targetTeam")}
            value={targetTeamId}
            onChange={(event) => setTargetTeamId(event.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="">{t("flags:dialog.noTeam")}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          {t("flags:dialog.note")}
          <input
            aria-label={t("flags:dialog.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="rounded bg-primary px-2 py-1 text-sm text-primary-foreground"
        >
          {t("flags:dialog.submit")}
        </button>
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
