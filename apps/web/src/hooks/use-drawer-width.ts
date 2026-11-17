import { useCallback, useEffect, useState } from "react";
import {
  parseStoredTaskDrawerWidth,
  widthFromPointer,
} from "@/lib/task-drawer-width";

/**
 * Persisted width for a right-anchored drawer resized by dragging its left
 * edge (#112). `null` until hydrated, so the CSS default renders first and the
 * stored choice is never overwritten by a default-width save.
 *
 * `defaultWidth` is a number or a viewport-derived resolver (the row drawer's
 * half-viewport default). Until the user drags — nothing in storage — the
 * default re-applies on window resize; a stored width is only re-clamped.
 */
export function useDrawerWidth(
  storageKey: string,
  defaultWidth: number | ((viewportWidth: number) => number),
) {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const fallback =
      typeof defaultWidth === "function"
        ? defaultWidth(window.innerWidth)
        : defaultWidth;
    setWidth(
      parseStoredTaskDrawerWidth(
        window.localStorage.getItem(storageKey),
        window.innerWidth,
        fallback,
      ),
    );
  }, [storageKey, defaultWidth]);

  // On resize: a stored width re-clamps (a width saved on a wide monitor must
  // not stay wider than the viewport); the untouched default tracks 50vw.
  useEffect(() => {
    const onResize = () => {
      const fallback =
        typeof defaultWidth === "function"
          ? defaultWidth(window.innerWidth)
          : defaultWidth;
      setWidth((current) =>
        current === null
          ? current
          : parseStoredTaskDrawerWidth(
              window.localStorage.getItem(storageKey),
              window.innerWidth,
              fallback,
            ),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storageKey, defaultWidth]);

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
