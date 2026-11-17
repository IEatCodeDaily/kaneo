import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/common/toolbar-button";

import useBulkSelectionStore from "@/store/bulk-selection";

/**
 * Bulk Actions toggle for List view, rendered in BoardToolbar immediately left
 * of Create ticket. It previously lived in a second toolbar row below the main
 * one, which existed only to hold this button and the nest hint.
 *
 * State comes from the bulk-selection store, so it works from the toolbar
 * without threading props through the view.
 */
function ListBulkActionsToggle() {
  const { t } = useTranslation();
  const isSelectMode = useBulkSelectionStore((state) => state.isSelectMode);
  const setSelectMode = useBulkSelectionStore((state) => state.setSelectMode);

  return (
    <ToolbarButton
      icon={<ListChecks className="size-3.5" />}
      label={
        isSelectMode ? t("common:actions.cancel") : t("tasks:bulkActions.label")
      }
      applied={isSelectMode}
      aria-pressed={isSelectMode}
      data-testid="list-bulk-actions"
      onClick={() => setSelectMode(!isSelectMode)}
    />
  );
}

export default ListBulkActionsToggle;
