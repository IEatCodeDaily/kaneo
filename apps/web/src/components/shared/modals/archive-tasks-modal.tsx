import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ArchiveTasksModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  taskCount: number;
};

export function ArchiveTasksModal({
  open,
  onClose,
  onConfirm,
  taskCount,
}: ArchiveTasksModalProps) {
  const isSingular = taskCount === 1;
  const taskLabel = isSingular ? "completed task" : "completed tasks";
  const allLabel = isSingular ? "" : "all ";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Archive Tasks</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Are you sure you want to archive {allLabel}
          <span className="font-semibold text-foreground mx-1">
            {taskCount}
          </span>
          {taskLabel}? This will move them from the active board to your
          archive.
        </DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
