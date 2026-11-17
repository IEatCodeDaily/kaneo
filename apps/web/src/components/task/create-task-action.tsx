import { Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";

const CreateTaskModal = lazy(
  () => import("@/components/shared/modals/create-task-modal"),
);

export default function CreateTaskAction({
  boardId,
  status,
}: {
  boardId: string;
  status?: "planned";
}) {
  const { t } = useTranslation();
  const { canCreateTasks } = useOrganizationPermission();
  const [open, setOpen] = useState(false);
  const label = t("navigation:commandPalette.createTask");

  if (!canCreateTasks()) return null;

  return (
    <>
      <ToolbarButton
        variant="default"
        label={label}
        icon={<Plus className="size-3.5" />}
        data-toolbar-primary=""
        data-testid="board-create-task"
        onClick={() => setOpen(true)}
      />
      {open ? (
        <Suspense fallback={<span className="sr-only">Loading editor</span>}>
          <CreateTaskModal
            open
            boardId={boardId}
            status={status}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
