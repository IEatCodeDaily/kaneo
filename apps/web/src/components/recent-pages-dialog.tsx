import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { recentRelativeTime } from "@/lib/recent-page";
import { useUserPreferencesStore } from "@/store/user-preferences";

/**
 * Full "Recently opened" view: every recorded entry (up to 50), not just the
 * slice shown under the sidebar's Recent section.
 */
export function RecentPagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const recentPages = useUserPreferencesStore((state) => state.recentPages);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("navigation:sidebar.recentViewAll")}</DialogTitle>
        </DialogHeader>
        {recentPages.length === 0 ? (
          <p className="pb-4 text-sm text-muted-foreground">
            {t("navigation:sidebar.recentEmpty")}
          </p>
        ) : (
          <ul className="max-h-80 space-y-0.5 overflow-y-auto pb-2">
            {recentPages.map((page) => (
              <li key={page.pathname}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    navigate({ to: page.pathname });
                    onOpenChange(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{page.label}</span>
                  {page.detail ? (
                    <span className="shrink-0 rounded bg-muted px-1 text-xs text-muted-foreground">
                      {page.detail}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {recentRelativeTime(page.openedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
