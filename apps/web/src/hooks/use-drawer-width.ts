import { useCallback, useEffect, useState } from "react";
import {
  clampTaskDrawerWidth,
  parseStoredTaskDrawerWidth,
  widthFromPointer,
} from "@/lib/task-drawer-width";

/**
 * Persisted width for a right-anchored drawer resized by dragging its left
 * edge (#112). `null` until hydrated, so the CSS default renders first and the
 * stored choice is never overwritten by a default-width save.
 */
export function useDrawerWidth(storageKey: string, defaultWidth: number) {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    setWidth(
      parseStoredTaskDrawerWidth(
        window.localStorage.getItem(storageKey),
        window.innerWidth,
        defaultWidth,
      ),
    );
  }, [storageKey, defaultWidth]);

  // Re-clamp when the window shrinks, otherwise a width saved on a wide
  // monitor leaves the drawer wider than the viewport.
  useEffect(() => {
    const onResize = () =>
      setWidth((current) =>
        current === null
          ? current
          : clampTaskDrawerWidth(current, window.innerWidth, defaultWidth),
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [defaultWidth]);

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const onMove = (moveEvent: PointerEvent) =>
        setWidth(widthFromPointer(moveEvent.clientX, window.innerWidth));
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        setWidth((current) => {
          if (current !== null)
            window.localStorage.setItem(storageKey, String(current));
          return current;
        });
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [storageKey],
  );

  return { width, startResize };
}
