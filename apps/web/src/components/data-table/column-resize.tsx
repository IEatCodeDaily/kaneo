import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const MIN_WIDTH = 80;
const MAX_WIDTH = 800;
const clamp = (width: number) =>
  Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
const storageKey = (tableId: string) => `kaneo-table-widths:${tableId}`;
export function readWidths(tableId: string): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(storageKey(tableId)) ?? "{}",
    );
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw)
        .filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isFinite(entry[1]),
        )
        .map(([id, width]) => [id, clamp(width)]),
    );
  } catch {
    return {};
  }
}

export function useColumnWidths(tableId: string) {
  const [state, setState] = useState(() => ({
    tableId,
    widths: readWidths(tableId),
  }));
  if (state.tableId !== tableId)
    setState({ tableId, widths: readWidths(tableId) });
  useEffect(() => {
    if (state.tableId !== tableId) return;
    try {
      localStorage.setItem(storageKey(tableId), JSON.stringify(state.widths));
    } catch {
      /* Storage unavailable: resizing still works for this visit. */
    }
  }, [state, tableId]);
  const setWidth = (fieldId: string, width: number | null) =>
    setState((current) => {
      const widths = { ...current.widths };
      if (width === null) delete widths[fieldId];
      else if (Number.isFinite(width)) widths[fieldId] = clamp(width);
      return { tableId, widths };
    });
  return { widths: state.widths, setWidth };
}

export function ColumnResizeHandle({
  name,
  width,
  onResize,
  onReset,
}: {
  name: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(
    null,
  );
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("navigation:tables.resizeColumn", { name })}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuenow={width}
      title={t("navigation:tables.resetColumnWidth")}
      className="absolute inset-y-0 right-0 z-10 h-full! w-2! touch-none cursor-col-resize rounded-none border-0 px-0 hover:bg-accent focus-visible:bg-accent"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.pointerId === event.pointerId)
          onResize(clamp(start.width + event.clientX - start.x));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current) onResize(drag.current.width);
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onResize(clamp(width + (event.key === "ArrowRight" ? 10 : -10)));
        }
        if (event.key === "Home") {
          event.preventDefault();
          onReset();
        }
      }}
    />
  );
}
