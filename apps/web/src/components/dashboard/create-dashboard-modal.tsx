import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDashboardMutations } from "@/hooks/dashboards/use-dashboards";
import { toast } from "@/lib/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** The URL slug to land on after creating (#resource-slugs). */
  organizationSlug?: string;
};

export default function CreateDashboardModal({
  open,
  onClose,
  organizationId,
  organizationSlug,
}: Props) {
  const [name, setName] = useState("");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createDashboard } = useDashboardMutations(organizationId);

  const close = () => {
    setName("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const dashboard = await createDashboard.mutateAsync({
        organizationId,
        name: name.trim(),
      });
      toast.success(t("navigation:dashboards.created"));
      close();
      navigate({
        to: "/dashboard/organization/$organizationSlug/dashboards/$dashboardId",
        params: {
          organizationSlug: organizationSlug ?? organizationId,
          dashboardId: dashboard.slug ?? dashboard.id,
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("navigation:dashboards.createError"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("navigation:dashboards.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("navigation:dashboards.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("navigation:dashboards.tableName")}
            aria-label={t("navigation:dashboards.tableName")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("navigation:dashboards.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createDashboard.isPending}
            >
              {createDashboard.isPending
                ? t("navigation:dashboards.creating")
                : t("navigation:dashboards.createAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
