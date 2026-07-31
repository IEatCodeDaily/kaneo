import { Flag } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import FlagDialog from "@/components/flag/flag-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import TaskFlagBadges from "./task-flag-badges";

type TaskFlagSectionProps = {
  taskId: string;
  boardId: string;
  organizationId: string;
};

/**
 * Task-detail surface: the active flag chips plus a "Flag" action that opens
 * the raise/resolve dialog.
 */
export function TaskFlagSection({
  taskId,
  boardId,
  organizationId,
}: TaskFlagSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: memberData } = useGetActiveOrganizationMembers(organizationId);

  // authClient.organization.listMembers resolves to { members, total }, NOT an
  // array. Treating it as an array crashed the whole task detail route with
  // "l.map is not a function" — every other call site reads `.members`.
  const users = (memberData?.members ?? []).map(
    (member: {
      userId?: string;
      user?: { name?: string; email?: string };
    }) => ({
      id: member.userId ?? "",
      name: member.user?.name ?? member.user?.email ?? "",
    }),
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground/70 px-2">
        {t("flags:title")}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 px-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px]"
        >
          <Flag className="w-2.5 h-2.5" />
          {t("flags:actions.flag")}
        </button>
        <TaskFlagBadges taskId={taskId} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("flags:dialog.title")}</DialogTitle>
          </DialogHeader>
          <FlagDialog
            taskId={taskId}
            boardId={boardId}
            users={users}
            teams={[]}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TaskFlagSection;
