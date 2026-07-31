/**
 * Markdown normalization for task descriptions.
 *
 * Extracted from task-description.tsx so the round-trip contract can be tested
 * directly. This function runs on BOTH the save path and the hydrate path, so
 * anything it rewrites is permanent: the editor writes the normalized form, and
 * the normalized form is what comes back.
 *
 * #99: it used to collapse `\n{3,}` to `\n\n`, which silently deleted authored
 * blank lines. Reopening the drawer showed fewer line breaks than the user
 * typed. Blank lines inside the body are authored content and are preserved.
 *
 * A trailing run of newlines IS stripped: that tail is an editor artifact
 * rather than authored content, and leaving it in makes every re-hydrate look
 * like a fresh change (which re-triggers the debounced save in a loop).
 */
export function formatTaskMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
}

export default formatTaskMarkdown;
