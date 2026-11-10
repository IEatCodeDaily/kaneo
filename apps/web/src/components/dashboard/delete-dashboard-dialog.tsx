import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteDashboardDialogProps = {
  open: boolean;
  dashboardName: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Panel deletion reuses this dialog with panel-specific wording. */
  title?: string;
  description?: string;
};

function DeleteDashboardDialog({
  open,
  dashboardName,
  isPending,
  onConfirm,
  onClose,
  title,
  description,
}: DeleteDashboardDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title ?? t("navigation:dashboards.delete")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              t("navigation:dashboards.deleteConfirm", { name: dashboardName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            disabled={isPending}
            render={<AlertDialogClose />}
            size="sm"
            variant="outline"
          >
            {t("navigation:dashboards.cancel")}
          </Button>
          <Button
            disabled={isPending}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {t("navigation:dashboards.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteDashboardDialog;
