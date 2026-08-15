import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useSetTaskFollowing from "@/hooks/mutations/task/use-set-task-following";
import useGetTaskFollowing from "@/hooks/queries/task/use-get-task-following";

type TaskFollowToggleProps = {
  taskId: string | undefined;
};

/**
 * KFL-339: subscribe yourself to a ticket's notifications.
 *
 * Styled as one of the outlined property pills in the same row (Status,
 * Priority, Assign, dates). KFL-337 was filed because the Assign chip had lost
 * that outline, so these classes are copied verbatim from its siblings rather
 * than re-invented.
 *
 * Deliberately NOT gated on edit permission: the endpoint is gated on READ
 * because following is a personal subscription, so a read-only member must be
 * able to follow too.
 */
export default function TaskFollowToggle({ taskId }: TaskFollowToggleProps) {
  const { t } = useTranslation();
  const { data } = useGetTaskFollowing(taskId ?? "");
  const { mutate: setFollowing, isPending } = useSetTaskFollowing();

  if (!taskId) {
    return null;
  }

  const following = Boolean(data?.following);

  return (
    <Button
      data-testid="task-follow-toggle"
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={following}
      disabled={isPending}
      onClick={() => setFollowing({ taskId, following: !following })}
      className="justify-start h-7 gap-1.5 rounded-md border border-border bg-transparent px-2.5 hover:bg-accent/50"
    >
      {following ? (
        <Bell className="w-3.5 h-3.5 text-muted-foreground" />
      ) : (
        <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <span className="text-xs font-semibold truncate">
        {following
          ? t("tasks:properties.following")
          : t("tasks:properties.follow")}
      </span>
    </Button>
  );
}
