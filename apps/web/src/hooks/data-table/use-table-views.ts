import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  legacyViewConfig,
  type SavedTableView,
  type SavedViewConfig,
} from "@/components/data-table/saved-view-layout";
import {
  getTableViews,
  updateTableView,
} from "@/fetchers/data-table/data-table";

export function useTableViews(
  organizationId: string,
  tableId: string,
  canEdit: boolean,
  enabled = true,
) {
  const client = useQueryClient();
  const key = ["table-views", organizationId, tableId];
  const target = { organizationId, tableId };
  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!organizationId && !!tableId,
    queryFn: async () => {
      const views = await getTableViews(target);
      const initial = views.find(
        (view) => view.isDefault && view.config === null,
      );
      if (initial && canEdit) {
        // Prune legacy ids of deleted fields before the server validates them.
        const table = await import("@/fetchers/data-table/data-table").then(
          (m) => m.getDataTable(tableId, organizationId),
        );
        const allowed = new Set([
          ...table.fields.map((f) => f.id),
          "__row_id",
          "__created_at",
          "__updated_at",
          "__created_by",
          "__updated_by",
        ]);
        const config = legacyViewConfig(tableId);
        config.hiddenFields = config.hiddenFields.filter((id) =>
          allowed.has(id),
        );
        config.columnWidths = Object.fromEntries(
          Object.entries(config.columnWidths).filter(([id]) => allowed.has(id)),
        );
        const updated = await updateTableView(target, initial.id, {
          config,
          initializeOnly: true,
        });
        return views.map((view) => (view.id === updated.id ? updated : view));
      }
      return views;
    },
  });
  const [local, setLocal] = useState<Record<string, SavedViewConfig>>({});
  const [saveError, setSaveError] = useState(false);
  const pending = useRef(
    new Map<
      string,
      { config: SavedViewConfig; organizationId: string; tableId: string }
    >(),
  );
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    // Queue writes, including writes arriving during a request, in order.
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        for (const [id, entry] of pending.current) {
          const { config, organizationId: org, tableId: table } = entry;
          await updateTableView({ organizationId: org, tableId: table }, id, {
            config,
          });
          if (pending.current.get(id) === entry) pending.current.delete(id);
          client.setQueryData<SavedTableView[]>(
            ["table-views", org, table],
            (views) =>
              views?.map((view) =>
                view.id === id ? { ...view, config } : view,
              ),
          );
        }
        setSaveError(false);
      });
    try {
      await chain.current;
      return true;
    } catch {
      setSaveError(true);
      return false;
    }
  }, [client]);
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );
  useEffect(() => {
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      if (pending.current.size) {
        void flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", protectUnsaved);
    return () => window.removeEventListener("beforeunload", protectUnsaved);
  }, [flush]);
  const change = useCallback(
    (id: string, config: SavedViewConfig) => {
      setLocal((current) => ({ ...current, [id]: config }));
      if (!canEdit) return;
      pending.current.set(id, { config, organizationId, tableId });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 250);
    },
    [canEdit, flush, organizationId, tableId],
  );
  return { ...query, local, change, flush, saveError };
}
