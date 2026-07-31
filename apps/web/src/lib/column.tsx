import { Circle } from "lucide-react";
import columnIcons, {
  DEFAULT_COLUMN_ICON_NAMES,
} from "@/constants/column-icons";

/**
 * Icon for a final ("done") column.
 *
 * A check-in-a-circle read as "there is a tick somewhere in here" at 16px, so
 * done was hard to tell apart from the other states at a glance (#64). This is
 * the in-progress dot taken almost all the way: a nearly full fill with a
 * deliberate gap left between the fill and the outline, so completion is
 * legible from shape alone rather than from a glyph.
 */
export const ColumnDoneIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    data-testid="column-done-icon"
  >
    <circle cx="12" cy="12" r="10" />
    {/* r=7 against the r=10 ring keeps a visible ring of background. */}
    <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />
  </svg>
);

export const getColumnIcon = (
  columnId: string,
  isFinal?: boolean,
  iconName?: string | null,
) => {
  const resolvedIconName =
    iconName ||
    DEFAULT_COLUMN_ICON_NAMES[
      columnId as keyof typeof DEFAULT_COLUMN_ICON_NAMES
    ];

  // CheckCircle2 is the done marker everywhere it appears, default or
  // explicitly configured, so it resolves to the filled circle instead.
  if (resolvedIconName === "CheckCircle2") {
    return <ColumnDoneIcon className="w-4 h-4 text-muted-foreground" />;
  }

  const Icon =
    resolvedIconName &&
    columnIcons[resolvedIconName as keyof typeof columnIcons];

  if (Icon) {
    return <Icon className="w-4 h-4 text-muted-foreground" />;
  }

  return isFinal ? (
    <ColumnDoneIcon className="w-4 h-4 text-muted-foreground" />
  ) : (
    <Circle className="w-4 h-4 text-muted-foreground" />
  );
};
