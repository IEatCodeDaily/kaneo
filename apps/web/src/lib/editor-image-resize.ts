/** Bounds for manual image resizing inside the description/comment editors. */
export const MIN_IMAGE_WIDTH = 64;
export const MAX_IMAGE_WIDTH = 1200;

/** Keeps a dragged width inside sane bounds (and off NaN). */
export function clampImageWidth(
  width: number,
  max: number = MAX_IMAGE_WIDTH,
): number {
  if (!Number.isFinite(width)) return MIN_IMAGE_WIDTH;
  const upperBound = Math.max(MIN_IMAGE_WIDTH, Math.round(max));
  return Math.min(Math.max(Math.round(width), MIN_IMAGE_WIDTH), upperBound);
}

/**
 * Class list for an editor image.
 *
 * The selected state is a class rather than a `:focus` style because a
 * ProseMirror node selection does not move DOM focus — the outline has to be
 * driven from the node view's `selectNode`/`deselectNode` callbacks.
 */
export function imageWrapperClass(selected: boolean): string {
  return selected
    ? "kaneo-editor-image-wrapper is-selected"
    : "kaneo-editor-image-wrapper";
}

/** Tooltip text for an image: prefers an explicit title, falls back to alt. */
export function imageTooltip(
  title: string | null | undefined,
  alt: string | null | undefined,
  fallback: string,
): string {
  return (title || "").trim() || (alt || "").trim() || fallback;
}
