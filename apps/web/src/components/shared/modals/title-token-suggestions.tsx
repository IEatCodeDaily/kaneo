import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  filterTitleTokenOptions,
  moveTitleTokenHighlight,
  type TitleToken,
  type TitleTokenKind,
} from "@/lib/title-token-autocomplete";

export type TitleTokenOption = {
  id: string;
  name: string;
  /** Optional swatch (labels) or icon (priority) rendered before the name. */
  color?: string;
  icon?: React.ReactNode;
};

type TitleTokenSuggestionsProps = {
  token: TitleToken | null;
  options: readonly TitleTokenOption[];
  onCommit: (option: TitleTokenOption) => void;
  onDismiss: () => void;
  /** Exposes the keyboard contract to the title input. */
  onRegisterKeyHandler?: (
    handler: ((event: React.KeyboardEvent<HTMLInputElement>) => boolean) | null,
  ) => void;
};

const KIND_LABEL: Record<TitleTokenKind, string> = {
  label: "tasks:titleTokens.labels",
  user: "tasks:titleTokens.members",
  priority: "tasks:titleTokens.priority",
};

/**
 * #72: the inline picker shown while a `#` / `@` / `>` token is being typed in
 * the Create Task title.
 *
 * Rendered inline beneath the title rather than as a popover, so it cannot
 * steal focus from the input — the input keeps the caret and forwards
 * navigation keys through the handler registered here.
 */
export function TitleTokenSuggestions({
  token,
  options,
  onCommit,
  onDismiss,
  onRegisterKeyHandler,
}: TitleTokenSuggestionsProps) {
  const { t } = useTranslation();
  const [rawHighlighted, setHighlighted] = useState(0);

  const matches = useMemo(
    () => (token ? filterTitleTokenOptions(options, token.query) : []),
    [options, token],
  );

  // A changed query re-ranks the list, so a stale index could point past the
  // end. Clamping during render avoids an effect that would briefly highlight
  // an unrelated row before correcting itself.
  const highlighted =
    matches.length === 0 ? 0 : rawHighlighted % matches.length;

  // Re-opening the picker for a different token must start at the top rather
  // than inheriting the previous run's highlight.
  const tokenKey = token ? `${token.kind}:${token.start}` : null;
  const lastTokenKeyRef = useRef<string | null>(null);
  if (tokenKey !== lastTokenKeyRef.current) {
    lastTokenKeyRef.current = tokenKey;
    if (rawHighlighted !== 0) setHighlighted(0);
  }

  useEffect(() => {
    if (!onRegisterKeyHandler) return;

    if (!token || matches.length === 0) {
      onRegisterKeyHandler(null);
      return;
    }

    onRegisterKeyHandler((event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((current) =>
          moveTitleTokenHighlight(current, 1, matches.length),
        );
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((current) =>
          moveTitleTokenHighlight(current, -1, matches.length),
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        // The ticket is explicit: Enter commits the suggestion. It must not
        // also submit the form.
        event.preventDefault();
        const option = matches[highlighted] ?? matches[0];
        if (option) onCommit(option);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return true;
      }
      // Space deliberately falls through: the sigil becomes plain title text.
      return false;
    });

    return () => onRegisterKeyHandler(null);
  }, [token, matches, highlighted, onCommit, onDismiss, onRegisterKeyHandler]);

  if (!token || matches.length === 0) return null;

  return (
    <div
      className="-mt-1 max-h-56 w-full max-w-xs overflow-y-auto rounded-md border border-border bg-popover shadow-md"
      data-testid="title-token-suggestions"
      data-token-kind={token.kind}
    >
      <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {t(KIND_LABEL[token.kind])}
      </div>
      {matches.map((option, index) => (
        <button
          className={cn(
            "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
            index === highlighted
              ? "bg-accent text-accent-foreground"
              : "text-foreground",
          )}
          data-active={index === highlighted ? "true" : undefined}
          data-testid="title-token-option"
          key={option.id}
          // The input owns the caret; taking focus here would close the token.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommit(option)}
          type="button"
        >
          {option.icon}
          {option.color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: option.color }}
            />
          )}
          <span className="truncate">{option.name}</span>
        </button>
      ))}
    </div>
  );
}

export default TitleTokenSuggestions;
