import { Pencil, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type {
  DataTableField,
  DataTableFieldType,
  DataTableRow,
} from "@/types/data-table";
import { DataTableCellView, type MemberOption } from "./data-table-cells";
import {
  asString,
  asStringArray,
  fieldChoices,
  fieldValue,
  isValidEmail,
  isValidNumberInput,
  isValidUrl,
  parseJsonValue,
} from "./data-table-format";
import { LinkCellPicker } from "./link-cell";
import { TicketCellPicker } from "./ticket-cell";

type EditorProps = {
  field: DataTableField;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
  /** Persistent form editors publish drafts without blur/Enter cell commits. */
  formMode?: boolean;
  onInvalidChange?: (invalid: boolean) => void;
  /** Type-to-replace: the keystroke that opened the editor seeds the draft. */
  seed?: string;
};

const NUMERIC_TYPES = ["number", "percent", "currency"];
const TEXT_INPUT_TYPES = ["text", "longtext", "url", "email"];

function EditorError({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute -bottom-4 left-0 z-10 whitespace-nowrap text-xs text-destructive">
      {message}
    </span>
  );
}

/** Text-ish, numeric and date editors: Enter/blur commits, Esc cancels. */
export function TableCellInput({
  field,
  value,
  onCommit,
  onCancel,
  formMode = false,
  onInvalidChange,
  seed,
}: EditorProps) {
  const { t } = useTranslation();
  const initial = useMemo(() => {
    if (field.type === "datetime") {
      const raw = asString(value);
      return raw ? raw.slice(0, 16) : "";
    }
    return asString(value);
  }, [field.type, value]);
  const [draft, setDraft] = useState(seed ?? initial);
  // Esc must cancel, but the blur handler still sees the pre-update draft
  // closure — flag the cancel explicitly so commit cannot fire with it.
  const cancelledRef = useRef(false);

  const isInvalid = (draft: string) =>
    (field.type === "url" &&
      draft.trim() !== "" &&
      !isValidUrl(draft.trim())) ||
    (field.type === "email" &&
      draft.trim() !== "" &&
      !isValidEmail(draft.trim())) ||
    (NUMERIC_TYPES.includes(field.type) &&
      draft !== "" &&
      !isValidNumberInput(draft, field));
  const invalid = isInvalid(draft);

  const errorKey =
    field.type === "url"
      ? "navigation:tables.invalidUrl"
      : field.type === "email"
        ? "navigation:tables.invalidEmail"
        : "navigation:tables.invalidNumber";

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return onCancel();
    }
    if (draft === initial) return onCancel();
    if (invalid) return;
    onCommit(typedValue(draft));
  };

  const typedValue = (draft: string): unknown => {
    if (draft === "") return null;
    if (TEXT_INPUT_TYPES.includes(field.type)) {
      return draft.trim() === ""
        ? null
        : field.type === "longtext"
          ? draft
          : draft.trim();
    }
    if (field.type === "date") {
      return draft;
    }
    if (field.type === "datetime") {
      return new Date(draft).toISOString();
    }
    return Number(draft);
  };

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "datetime"
        ? "datetime-local"
        : NUMERIC_TYPES.includes(field.type)
          ? "number"
          : "text";

  const multiline = field.type === "longtext";
  const editorProps = {
    autoFocus: !formMode,
    value: draft,
    "aria-invalid": invalid || undefined,
    "aria-label": field.name,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const next = event.target.value;
      setDraft(next);
      if (formMode) {
        const invalid = isInvalid(next);
        onInvalidChange?.(invalid);
        if (!invalid) onCommit(typedValue(next));
      }
    },
    onBlur: formMode ? undefined : commit,
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (formMode) return;
      event.stopPropagation();
      if (
        event.key === "Enter" &&
        (!multiline || event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelledRef.current = true;
        setDraft(initial);
        event.currentTarget.blur();
      }
    },
  };
  return (
    <div className="relative min-w-0 flex-1">
      {multiline ? (
        <Textarea
          {...editorProps}
          rows={4}
          className="min-h-24 w-full text-ui [&_textarea]:resize-y [&_textarea]:px-2 [&_textarea]:py-1"
        />
      ) : (
        <Input
          {...editorProps}
          unstyled={!formMode}
          type={inputType}
          // "any": the browser must not flag 1.25 on a 0-decimal field.
          step={NUMERIC_TYPES.includes(field.type) ? "any" : undefined}
          min={field.options?.min}
          max={field.options?.max}
          className={cn(
            "h-full w-full text-ui [&_input]:px-2",
            inputType === "number" &&
              "[&_input]:text-right [&_input]:tabular-nums",
          )}
        />
      )}
      {invalid && <EditorError message={t(errorKey)} />}
    </div>
  );
}

export function JsonCellEditor({
  field,
  value,
  onCommit,
  onCancel,
  formMode = false,
  onInvalidChange,
  seed,
}: EditorProps) {
  const { t } = useTranslation();
  const initial = useMemo(() => {
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value);
    } catch {
      return asString(value);
    }
  }, [value]);
  const [draft, setDraft] = useState(seed ?? initial);
  // Esc flags cancel: the blur-triggered commit closure still holds the
  // pre-update draft, so resetting state alone would commit it.
  const cancelledRef = useRef(false);
  const parsed = parseJsonValue(draft);
  const invalid = !parsed.ok && draft.trim() !== "";

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return onCancel();
    }
    if (draft === initial) return onCancel();
    if (!parsed.ok) return;
    onCommit(parsed.value);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea
        autoFocus={!formMode}
        value={draft}
        aria-invalid={invalid || undefined}
        aria-label={field.name}
        rows={3}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (formMode) {
            const parsed = parseJsonValue(next);
            onInvalidChange?.(!parsed.ok);
            if (parsed.ok) onCommit(parsed.value);
          }
        }}
        onBlur={formMode ? undefined : commit}
        onKeyDown={(event) => {
          if (formMode) return;
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            cancelledRef.current = true;
            setDraft(initial);
            event.currentTarget.blur();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="min-h-0 w-full font-mono text-xs [&_textarea]:resize-none [&_textarea]:px-2 [&_textarea]:py-1"
      />
      {invalid && <EditorError message={t("navigation:tables.typeJson")} />}
    </div>
  );
}

type PickerProps = {
  field: DataTableField;
  value: unknown;
  canEdit: boolean;
  members?: Map<string, MemberOption>;
  onCommit: (value: unknown) => void;
  children: React.ReactNode;
};

function PickerList({
  options,
  selectedIds,
  onSelect,
  emptyText,
  allowEmpty,
  emptyLabel,
}: {
  options: Array<{ id: string; label: string; color?: string }>;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  emptyText?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div
      role="listbox"
      aria-multiselectable={selectedIds.length > 1 || undefined}
      className="flex max-h-[min(16rem,60dvh)] flex-col gap-1 overflow-y-auto"
    >
      {options.length === 0 && emptyText && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</p>
      )}
      {allowEmpty && (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          role="option"
          aria-selected={selectedIds.length === 0}
          className="min-h-8 shrink-0 justify-start px-2 text-left text-muted-foreground"
          onClick={() => onSelect(null)}
        >
          {emptyLabel}
        </Button>
      )}
      {options.map((option) => (
        <Button
          variant="ghost"
          size="sm"
          key={option.id}
          type="button"
          role="option"
          aria-selected={selectedIds.includes(option.id)}
          className="min-h-8 shrink-0 justify-start gap-2 px-2 text-left data-[selected=true]:bg-accent"
          data-selected={selectedIds.includes(option.id)}
          onClick={() => onSelect(option.id)}
        >
          {option.color && (
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: option.color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
        </Button>
      ))}
    </div>
  );
}

function PickerTrigger({
  label,
  children,
  open,
  onOpenChange,
  content,
}: {
  label: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild nativeButton={false}>
        <Button
          variant="ghost"
          size="sm"
          render={<div />}
          role="button"
          tabIndex={0}
          aria-label={label}
          className="h-auto min-w-0 flex-1 justify-start whitespace-normal border-0 px-0 text-left sm:h-auto"
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        inset="panel"
        className="h-auto w-56 max-h-[70dvh] [&_[data-slot=popover-viewport]]:flex [&_[data-slot=popover-viewport]]:h-auto [&_[data-slot=popover-viewport]]:flex-col [&_[data-slot=popover-viewport]]:gap-2"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

/** Radio-style single pick (select cells). Commits immediately on pick. */
export function SelectCellPicker({
  field,
  value,
  canEdit,
  onCommit,
  children,
}: PickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!canEdit) return <>{children}</>;
  return (
    <PickerTrigger
      label={t("navigation:tables.selectChoice")}
      open={open}
      onOpenChange={setOpen}
      content={
        <PickerList
          options={fieldChoices(field)}
          selectedIds={[asString(value)]}
          emptyText={t("navigation:tables.selectChoice")}
          allowEmpty
          emptyLabel={t("navigation:tables.unassigned")}
          onSelect={(id) => {
            onCommit(id);
            setOpen(false);
          }}
        />
      }
    >
      {children}
    </PickerTrigger>
  );
}

export function MultiSelectCellPicker({
  field,
  value,
  canEdit,
  onCommit,
  children,
}: PickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!canEdit) return <>{children}</>;
  return (
    <PickerTrigger
      label={t("navigation:tables.selectChoice")}
      open={open}
      onOpenChange={setOpen}
      content={
        <PickerList
          options={fieldChoices(field)}
          selectedIds={asStringArray(value)}
          emptyText={t("navigation:tables.selectChoice")}
          allowEmpty
          emptyLabel={t("navigation:tables.unassigned")}
          onSelect={(id) => {
            const current = new Set(asStringArray(value));
            if (id === null) current.clear();
            else if (current.has(id)) current.delete(id);
            else current.add(id);
            onCommit([...current]);
          }}
        />
      }
    >
      {children}
    </PickerTrigger>
  );
}

export function UserCellPicker({
  value,
  canEdit,
  members,
  onCommit,
  children,
}: PickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  if (!canEdit) return <>{children}</>;
  const filtered = Array.from(members?.values() ?? []).filter((member) =>
    (member.user.name || member.user.email || "")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <PickerTrigger
      label={t("navigation:tables.selectChoice")}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      content={
        <>
          <div className="relative mb-1 flex items-center px-1">
            <Search className="absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              className="h-7 text-xs [&_input]:pl-7"
              aria-label={t("navigation:tables.searchRows")}
            />
          </div>
          <PickerList
            options={filtered.map((member) => ({
              id: member.id,
              label:
                member.user.name ||
                member.user.email ||
                t("navigation:tables.unknownValue"),
            }))}
            selectedIds={[asString(value)]}
            emptyText={t("navigation:tables.userPickerEmpty")}
            allowEmpty
            emptyLabel={t("navigation:tables.unassigned")}
            onSelect={(id) => {
              onCommit(id);
              setOpen(false);
            }}
          />
        </>
      }
    >
      {children}
    </PickerTrigger>
  );
}

/** Types whose editor is a text/number/date input that can seed-edit. */
export const INPUT_EDIT_TYPES: DataTableFieldType[] = [
  "text",
  "longtext",
  "url",
  "email",
  "number",
  "percent",
  "currency",
  "date",
  "datetime",
];

/**
 * One cell = view + editor wiring. The grid only renders this.
 */
export function DataTableCellContent({
  row,
  field,
  members,
  canEdit,
  isEditing,
  expanded = false,
  wrapLines,
  seed,
  onEditStart,
  onEditEnd,
  onCommit,
}: {
  row: DataTableRow;
  field: DataTableField;
  members: Map<string, MemberOption>;
  canEdit: boolean;
  isEditing: boolean;
  expanded?: boolean;
  /** Lines of long text to show before clamping (row-height wrap mode). */
  wrapLines?: number;
  /** Type-to-replace seed from the grid's keyboard handler. */
  seed?: string;
  onEditStart: () => void;
  onEditEnd: () => void;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const value = fieldValue(row, field);
  if (field.system)
    return (
      <DataTableCellView
        field={field}
        value={value}
        members={members}
        expanded={expanded}
        wrapLines={wrapLines}
      />
    );
  const canInlineEdit = INPUT_EDIT_TYPES.includes(field.type);
  const numericAlign = NUMERIC_TYPES.includes(field.type);
  if (canEdit && isEditing && field.type === "json") {
    return (
      <JsonCellEditor
        field={field}
        value={value}
        seed={seed}
        onCommit={onCommit}
        onCancel={onEditEnd}
      />
    );
  }
  if (canEdit && isEditing && canInlineEdit) {
    return (
      <TableCellInput
        field={field}
        value={value}
        seed={seed}
        onCommit={onCommit}
        onCancel={onEditEnd}
      />
    );
  }
  const view = (
    <DataTableCellView
      field={field}
      value={value}
      members={members}
      expanded={expanded}
      wrapLines={wrapLines}
      onToggleCheckbox={canEdit ? (checked) => onCommit(checked) : undefined}
    />
  );
  const pickerProps = { field, value, canEdit, onCommit, children: view };
  if (field.type === "select") return <SelectCellPicker {...pickerProps} />;
  if (field.type === "multiselect")
    return <MultiSelectCellPicker {...pickerProps} />;
  if (field.type === "ticket") return <TicketCellPicker {...pickerProps} />;
  if (field.type === "link")
    return <LinkCellPicker {...pickerProps} rowId={row.id} members={members} />;
  if (field.type === "user")
    return <UserCellPicker {...pickerProps} members={members} />;
  // Markdown and URL/email projections contain links: never nest them in a button.
  return (
    <div
      className={cn(
        "group/value relative min-w-0 flex-1",
        expanded &&
          canEdit &&
          (canInlineEdit || field.type === "json") &&
          "pr-8",
        numericAlign && "text-right tabular-nums",
      )}
    >
      {view}
      {expanded && canEdit && (canInlineEdit || field.type === "json") && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-0 top-0 opacity-0 group-hover/value:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          onClick={onEditStart}
          aria-label={t("navigation:tables.editField")}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
