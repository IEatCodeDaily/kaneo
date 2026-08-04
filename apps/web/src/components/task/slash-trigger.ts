/**
 * Slash-command trigger detection, shared by the description and comment
 * editors.
 *
 * #267: both editors used `/(?:^|\s)\/([^\s/]*)$/`, which matches a **bare
 * trailing slash**. Because the slash menu being "open" makes a capture-phase
 * window keydown handler swallow Enter, typing a checklist item that ends in a
 * slash — `- [ ] ship it /` — made Enter run a slash command instead of creating
 * the next item. That both failed to split the item and mangled the list.
 *
 * A trigger only counts when the user has actually started typing a command
 * after the slash. A lone `/` no longer opens the menu, so Enter behaves
 * normally; typing `/t` opens it as before.
 */

export type SlashTriggerMatch = {
  /** The command query typed after the slash (never empty). */
  query: string;
  /** The full matched text, including any leading space. */
  matchText: string;
};

/**
 * Only letters/digits/hyphen can start or continue a command name. That keeps
 * `and/or`, a trailing `/`, and a date like `12/` from opening the menu, while
 * still matching every real command (`todo`, `code-block`, `h1`).
 */
const SLASH_TRIGGER = /(?:^|\s)(\/[A-Za-z0-9][A-Za-z0-9-]*)$/;

export function matchSlashTrigger(
  textBeforeCursor: string,
): SlashTriggerMatch | null {
  const match = SLASH_TRIGGER.exec(textBeforeCursor);
  if (!match) return null;

  const token = match[1];
  // Strip the leading slash to get the query the command list filters on.
  const query = token.slice(1);
  if (!query) return null;

  return { query, matchText: match[0] };
}

/**
 * True when Enter should be treated as "accept the highlighted slash command"
 * rather than "insert a newline / split the list item".
 *
 * Callers must gate their Enter interception on this rather than on the mere
 * existence of menu state, so an open-but-empty menu can never eat Enter.
 */
export function shouldSlashMenuCaptureEnter({
  hasMenu,
  commandCount,
}: {
  hasMenu: boolean;
  commandCount: number;
}): boolean {
  return hasMenu && commandCount > 0;
}
