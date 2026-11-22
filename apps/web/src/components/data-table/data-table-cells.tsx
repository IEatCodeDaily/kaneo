import type { LucideIcon } from "lucide-react";
import {
  AlignLeft,
  ArrowLeftRight,
  Banknote,
  Braces,
  Calendar,
  CalendarClock,
  Check,
  CircleDot,
  CircleUser,
  ExternalLink,
  Hash,
  Link2,
  ListChecks,
  Mail,
  Percent,
  Square,
  Ticket,
  Type,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { isValidUrl } from "@/components/data-table/data-table-format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import type { DataTableField, SelectChoice } from "@/types/data-table";
import {
  asBool,
  asNumber,
  asString,
  asStringArray,
  fieldChoices,
  fieldPrecision,
  formatCurrencyValue,
  formatDateTimeValue,
  formatDateValue,
  formatNumberValue,
} from "./data-table-format";
import { LinkCellView } from "./link-cell";
import { TicketCellView } from "./ticket-cell";

const MarkdownRenderer = lazy(() =>
  import("@/components/public-board/markdown-renderer").then((module) => ({
    default: module.MarkdownRenderer,
  })),
);

export type MemberOption = {
  id: string;
  user: { name?: string | null; image?: string | null; email?: string | null };
};

const FIELD_TYPE_ICONS: Record<string, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  number: Hash,
  percent: Percent,
  currency: Banknote,
  date: Calendar,
  datetime: CalendarClock,
  select: CircleDot,
  multiselect: ListChecks,
  checkbox: Check,
  user: CircleUser,
  url: ExternalLink,
  email: Mail,
  json: Braces,
  link: Link2,
  ticket: Ticket,
  lookup: ArrowLeftRight,
};

export function FieldTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = FIELD_TYPE_ICONS[type] ?? Square;
  return <Icon className={cn("size-3.5 shrink-0", className)} />;
}

function EmptyValue() {
  return <span className="text-faint-foreground">—</span>;
}

function chipStyle(color: string): React.CSSProperties {
  return { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` };
}

export function ChoiceChip({
  choice,
  unknownId,
}: {
  choice?: SelectChoice;
  unknownId?: boolean;
}) {
  if (!choice || unknownId) return <EmptyValue />;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs font-medium"
      style={chipStyle(choice.color)}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: choice.color }}
      />
      <span className="truncate">{choice.label}</span>
    </span>
  );
}

function resolveChoice(field: DataTableField, id: unknown) {
  const raw = asString(id);
  if (!raw) return undefined;
  return fieldChoices(field).find((choice) => choice.id === raw);
}

function UserCell({
  value,
  members,
}: {
  value: unknown;
  members: Map<string, MemberOption>;
}) {
  const member = members.get(asString(value));
  const { t } = useTranslation();
  if (!member)
    return asString(value) ? (
      <span className="text-muted-foreground">
        {t("navigation:tables.formerMember")}
      </span>
    ) : (
      <EmptyValue />
    );
  const name =
    member.user.name ||
    member.user.email ||
    t("navigation:tables.formerMember");
  const image = member.user.image;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar className={cn("size-5 shrink-0", getAvatarTone(member.id, name))}>
        {image ? <AvatarImage src={image} alt={name} /> : null}
        <AvatarFallback className="text-xs font-semibold">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {name}
      </span>
    </div>
  );
}

function JsonCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || asString(value) === "") {
    return <EmptyValue />;
  }
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = asString(value);
  }
  return (
    <span className="truncate font-mono text-xs text-muted-foreground">
      {text}
    </span>
  );
}

/**
 * Read-only projection of one cell. Interactive affordances (popover pickers,
 * inline editors, checkbox toggle) are layered on by data-table-editors.
 */
// Literal classes so Tailwind picks the clamp sizes up.
const WRAP_CLAMP: Record<number, string> = {
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

export function DataTableCellView({
  field,
  value,
  members,
  onToggleCheckbox,
  expanded = false,
  wrapLines,
}: {
  field: DataTableField;
  value: unknown;
  members: Map<string, MemberOption>;
  onToggleCheckbox?: (checked: boolean) => void;
  expanded?: boolean;
  /** Row-height wrap mode: lines of long text before clamping. */
  wrapLines?: number;
}) {
  const { t } = useTranslation();
  const wrapped = !!wrapLines && !expanded;
  switch (field.type) {
    case "select":
      return <ChoiceChip choice={resolveChoice(field, value)} />;
    case "multiselect": {
      const selected = asStringArray(value);
      if (selected.length === 0) return <EmptyValue />;
      const choices = fieldChoices(field);
      const visible = selected
        .slice(0, expanded || wrapped ? undefined : 2)
        .map((id) => choices.find((choice) => choice.id === id));
      const overflow = selected.length - visible.length;
      return (
        <div
          className={cn(
            "flex min-w-0 items-center gap-1",
            expanded || wrapped ? "flex-wrap" : "overflow-hidden",
          )}
        >
          {visible.map((choice, index) => (
            <ChoiceChip
              key={selected[index]}
              choice={choice}
              unknownId={!choice}
            />
          ))}
          {overflow > 0 && (
            <Badge variant="secondary" className="shrink-0 px-1.5 text-xs">
              +{overflow}
            </Badge>
          )}
        </div>
      );
    }
    case "number":
    case "percent": {
      const parsed = asNumber(value);
      if (parsed === null) return <EmptyValue />;
      const text =
        field.type === "percent"
          ? `${formatNumberValue(value, fieldPrecision(field))}%`
          : formatNumberValue(value, fieldPrecision(field));
      return <span className="truncate tabular-nums">{text}</span>;
    }
    case "currency": {
      const text = formatCurrencyValue(value, field);
      return text ? (
        <span className="truncate tabular-nums">{text}</span>
      ) : (
        <EmptyValue />
      );
    }
    case "date": {
      const text = formatDateValue(value);
      return text ? (
        <span className="truncate tabular-nums text-muted-foreground">
          {text}
        </span>
      ) : (
        <EmptyValue />
      );
    }
    case "datetime": {
      const text = formatDateTimeValue(value);
      return text ? (
        <span className="truncate tabular-nums text-muted-foreground">
          {text}
        </span>
      ) : (
        <EmptyValue />
      );
    }
    case "checkbox":
      return (
        <Checkbox
          checked={asBool(value)}
          disabled={!onToggleCheckbox}
          className={!onToggleCheckbox ? "pointer-events-none" : undefined}
          aria-label={t("navigation:tables.toggleCheckbox", {
            field: field.name,
          })}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => onToggleCheckbox?.(checked === true)}
        />
      );
    case "user":
      return <UserCell value={value} members={members} />;
    case "url": {
      const text = asString(value);
      if (!text) return <EmptyValue />;
      // Stored values skip the editor's validation; only render real http(s)
      // links so an imported `javascript:` value cannot execute on click.
      if (!isValidUrl(text)) {
        return <span className="truncate text-muted-foreground">{text}</span>;
      }
      return (
        <a
          href={text}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          className="truncate text-muted-foreground hover:text-foreground hover:underline"
        >
          {text}
        </a>
      );
    }
    case "email": {
      const text = asString(value);
      if (!text) return <EmptyValue />;
      return (
        <a
          href={`mailto:${text}`}
          onClick={(event) => event.stopPropagation()}
          className="truncate text-muted-foreground hover:text-foreground hover:underline"
        >
          {text}
        </a>
      );
    }
    case "longtext": {
      const text = asString(value);
      if (!text) return <EmptyValue />;
      return (
        <div
          data-expanded={expanded}
          className={cn(
            "min-w-0 w-full break-words text-sm [&_.tiptap]:min-h-0 [&_.tiptap]:p-0",
            !expanded &&
              (wrapped
                ? cn(
                    WRAP_CLAMP[wrapLines ?? 0] ?? "line-clamp-1",
                    "overflow-hidden [&_.tiptap]:text-ui [&_.tiptap>*]:m-0 [&_.tiptap>*]:text-ui [&_.tiptap>*]:leading-5",
                  )
                : "line-clamp-1 max-h-6 overflow-hidden [&_.tiptap]:text-ui [&_.tiptap>*]:m-0 [&_.tiptap>*]:text-ui [&_.tiptap>*]:leading-5"),
          )}
        >
          <Suspense fallback={<span>{text}</span>}>
            <MarkdownRenderer content={text} />
          </Suspense>
        </div>
      );
    }
    case "json":
      return <JsonCell value={value} />;
    case "ticket":
      return asStringArray(value).length === 0 ? (
        <EmptyValue />
      ) : (
        <TicketCellView value={value} expanded={expanded} wrapLines={wrapped} />
      );
    case "link":
      return <LinkCellView value={value} expanded={expanded} />;
    case "lookup": {
      // Read-only: resolved through the link relation at read time. Values
      // render with the target field's formatting where cheap.
      if (
        value &&
        typeof value === "object" &&
        "status" in (value as Record<string, unknown>)
      )
        return (
          <span className="text-muted-foreground">
            {t("navigation:tables.linkUnavailable")}
          </span>
        );
      const values = Array.isArray(value) ? value : [];
      const target = field.options?.targetField;
      if (!target) {
        const text = values
          .map((item) =>
            typeof item === "string" || typeof item === "number"
              ? String(item)
              : "",
          )
          .filter(Boolean)
          .join(", ");
        return text ? (
          <span className="truncate text-muted-foreground">{text}</span>
        ) : (
          <EmptyValue />
        );
      }
      const targetField: DataTableField = {
        ...field,
        name: target.name,
        type: target.type,
        options: (target.options ?? null) as DataTableField["options"],
      };
      if (!values.length) return <EmptyValue />;
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {values.map((item, index) => (
            <span
              key={`${index}:${typeof item}:${String(item)}`}
              className="min-w-0 max-w-full truncate"
            >
              <DataTableCellView
                field={targetField}
                value={item}
                members={members}
              />
            </span>
          ))}
        </div>
      );
    }
    default: {
      const text = asString(value);
      if (!text) return <EmptyValue />;
      return (
        <span
          className={
            wrapped
              ? "block min-w-0 whitespace-pre-wrap break-words"
              : "block truncate"
          }
        >
          {text}
        </span>
      );
    }
  }
}
