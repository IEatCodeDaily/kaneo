import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  fieldPrecision,
  isValidEmail,
  isValidNumberInput,
  isValidUrl,
  parseJsonValue,
} from "./data-table-format";

type EditorProps = {
  field: DataTableField;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
};

const NUMERIC_TYPES = ["number", "percent", "currency"];
const TEXT_INPUT_TYPES = ["text", "longtext", "url", "email"];

function EditorError({ message }: { message: string }) {
  return (
    <span className="pointer-events-none absolute -bottom-4 left-0 z-10 whitespace-nowrap text-[10px] text-destructive">
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
}: EditorProps) {
  const { t } = useTranslation();
  const initial = useMemo(() => {
    if (field.type === "datetime") {
      const raw = asString(value);
      return raw ? raw.slice(0, 16) : "";
    }
    return asString(value);
  }, [field.type, value]);
  const [draft, setDraft] = useState(initial);
  // Esc must cancel, but the blur handler still sees the pre-update draft
  // closure — flag the cancel explicitly so commit cannot fire with it.
  const cancelledRef = useRef(false);

  const invalid =
    (field.type === "url" &&
      draft.trim() !== "" &&
      !isValidUrl(draft.trim())) ||
    (field.type === "email" &&
      draft.trim() !== "" &&
      !isValidEmail(draft.trim())) ||
    (NUMERIC_TYPES.includes(field.type) &&
      draft !== "" &&
      !isValidNumberInput(draft, field));

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
    if (invalid) return onCancel();
    if (TEXT_INPUT_TYPES.includes(field.type)) {
      return onCommit(draft.trim() === "" ? null : draft.trim());
    }
    if (field.type === "date") {
      return onCommit(draft === "" ? null : draft);
    }
    if (field.type === "datetime") {
      return onCommit(draft === "" ? null : new Date(draft).toISOString());
    }
    return onCommit(Number(draft));
  };

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "datetime"
        ? "datetime-local"
        : NUMERIC_TYPES.includes(field.type)
          ? "number"
          : "text";

  const precision = fieldPrecision(field);

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        autoFocus
        unstyled
        type={inputType}
        value={draft}
        aria-invalid={invalid || undefined}
        step={
          NUMERIC_TYPES.includes(field.type)
            ? precision > 0
              ? Number((1 / 10 ** precision).toFixed(precision))
              : 1
            : undefined
        }
        min={field.options?.min}
        max={field.options?.max}
        aria-label={field.name}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(initial);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "h-full w-full px-2.5 text-[13px]",
          inputType === "number" && "text-right tabular-nums",
        )}
      />
      {invalid && <EditorError message={t(errorKey)} />}
    </div>
  );
}

export function JsonCellEditor({
  field,
  value,
  onCommit,
  onCancel,
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
  const [draft, setDraft] = useState(initial);
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
    if (!parsed.ok) return onCancel();
    onCommit(parsed.value);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea
        autoFocus
        value={draft}
        aria-invalid={invalid || undefined}
        aria-label={field.name}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancelledRef.current = true;
            setDraft(initial);
            event.currentTarget.blur();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="min-h-0 w-full resize-none px-2 py-1 font-mono text-xs"
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
      className="flex max-h-64 flex-col gap-0.5 overflow-y-auto"
    >
      {options.length === 0 && emptyText && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</p>
      )}
      {allowEmpty && (
        <button
          type="button"
          role="option"
          aria-selected={selectedIds.length === 0}
          className="rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
          onClick={() => onSelect(null)}
        >
          {emptyLabel}
        </button>
      )}
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="option"
          aria-selected={selectedIds.includes(option.id)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent data-[selected=true]:bg-accent"
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
        </button>
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
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
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
              className="h-7 pl-7 text-xs"
              aria-label={t("navigation:tables.searchRows")}
            />
          </div>
          <PickerList
            options={filtered.map((member) => ({
              id: member.id,
              label: member.user.name || member.user.email || member.id,
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

const INPUT_EDIT_TYPES: DataTableFieldType[] = [
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
  onEditStart,
  onEditEnd,
  onCommit,
}: {
  row: DataTableRow;
  field: DataTableField;
  members: Map<string, MemberOption>;
  canEdit: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const value = row.values[field.id];
  const canInlineEdit = INPUT_EDIT_TYPES.includes(field.type);

  if (field.type === "checkbox") {
    return (
      <DataTableCellView
        field={field}
        value={value}
        members={members}
        onToggleCheckbox={canEdit ? (checked) => onCommit(checked) : undefined}
      />
    );
  }

  if (isEditing && field.type === "json") {
    return (
      <JsonCellEditor
        field={field}
        value={value}
        onCommit={onCommit}
        onCancel={onEditEnd}
      />
    );
  }
  if (isEditing && canInlineEdit) {
    return (
      <TableCellInput
        field={field}
        value={value}
        onCommit={onCommit}
        onCancel={onEditEnd}
      />
    );
  }

  const view = (
    <DataTableCellView field={field} value={value} members={members} />
  );

  if (field.type === "select") {
    return (
      <SelectCellPicker
        field={field}
        value={value}
        canEdit={canEdit}
        onCommit={onCommit}
      >
        {view}
      </SelectCellPicker>
    );
  }
  if (field.type === "multiselect") {
    return (
      <MultiSelectCellPicker
        field={field}
        value={value}
        canEdit={canEdit}
        onCommit={onCommit}
      >
        {view}
      </MultiSelectCellPicker>
    );
  }
  if (field.type === "user") {
    return (
      <UserCellPicker
        field={field}
        value={value}
        canEdit={canEdit}
        members={members}
        onCommit={onCommit}
      >
        {view}
      </UserCellPicker>
    );
  }
  return canEdit && (canInlineEdit || field.type === "json") ? (
    <button
      type="button"
      className={cn(
        "min-w-0 flex-1 cursor-pointer text-left",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
      )}
      onClick={onEditStart}
      title={t("navigation:tables.editField")}
    >
      {view}
    </button>
  ) : (
    <div className="min-w-0 flex-1">{view}</div>
  );
}
