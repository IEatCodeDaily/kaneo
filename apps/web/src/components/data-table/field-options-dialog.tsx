import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDataTableMutations } from "@/hooks/data-table/use-data-tables";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type {
  DataTableField,
  DataTableFieldOptions,
  DataTableFieldType,
  SelectChoice,
} from "@/types/data-table";
import { FieldTypeIcon } from "./data-table-cells";
import {
  EDITABLE_FIELD_TYPES,
  FIELD_TYPE_LABEL_KEYS,
  fieldIsRequired,
  makeChoiceId,
  optionsForType,
} from "./data-table-format";

const CHOICE_PALETTE = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#eab308",
  "#06b6d4",
  "#ec4899",
  "#ef4444",
];

type Props = {
  organizationId: string;
  tableId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing field to edit; null adds a new field. */
  field: DataTableField | null;
  /** Type preselected by "change type" before opening this dialog. */
  initialType?: DataTableFieldType | null;
};

const palette = (index: number) =>
  CHOICE_PALETTE[index % CHOICE_PALETTE.length];

export default function FieldOptionsDialog({
  organizationId,
  tableId,
  open,
  onOpenChange,
  field,
  initialType,
}: Props) {
  const { t } = useTranslation();
  const { createField, updateField } = useDataTableMutations(
    organizationId,
    tableId,
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<DataTableFieldType>("text");
  const [choices, setChoices] = useState<SelectChoice[]>([]);
  const [precision, setPrecision] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [code, setCode] = useState("");
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (!open) return;
    const options: DataTableFieldOptions = field?.options ?? {};
    setName(field?.name ?? "");
    setType(initialType ?? field?.type ?? "text");
    setChoices(options.choices ? options.choices.map((c) => ({ ...c })) : []);
    setPrecision(
      typeof options.precision === "number" ? String(options.precision) : "",
    );
    setMin(typeof options.min === "number" ? String(options.min) : "");
    setMax(typeof options.max === "number" ? String(options.max) : "");
    setCode(options.code ?? "");
    setRequired(field ? fieldIsRequired(field) : false);
  }, [open, field, initialType]);

  const buildOptions = (): DataTableFieldOptions | undefined => {
    const draft: DataTableFieldOptions = optionsForType(type, field?.options);
    if (type === "select" || type === "multiselect") {
      draft.choices = choices.filter((choice) => choice.label.trim() !== "");
    }
    if (type === "number" || type === "percent") {
      // Cleared inputs unset the option — never carry the stale value over.
      if (precision !== "") draft.precision = Number(precision);
      else delete draft.precision;
      if (min !== "") draft.min = Number(min);
      else delete draft.min;
      if (max !== "") draft.max = Number(max);
      else delete draft.max;
    }
    if (type === "currency") {
      if (code.trim() !== "") draft.code = code.trim();
      else delete draft.code;
    }
    if (required) draft.required = true;
    else delete draft.required;
    return draft;
  };

  const optionsValid =
    (type !== "currency" || code.trim() !== "") &&
    (type !== "select" && type !== "multiselect"
      ? true
      : choices.some((choice) => choice.label.trim() !== ""));

  const saveDisabled =
    createField.isPending ||
    updateField.isPending ||
    (!field && name.trim() === "") ||
    !optionsValid;

  const save = async () => {
    const options = buildOptions();
    try {
      if (field) {
        await updateField.mutateAsync({
          organizationId,
          tableId,
          fieldId: field.id,
          type,
          options,
        });
      } else {
        await createField.mutateAsync({
          organizationId,
          tableId,
          name: name.trim(),
          type,
          options,
        });
      }
      onOpenChange(false);
    } catch {
      toast.error(
        t(
          field
            ? "navigation:tables.renameFieldError"
            : "navigation:tables.addFieldError",
        ),
      );
    }
  };

  const updateChoice = (id: string, patch: Partial<SelectChoice>) =>
    setChoices((current) =>
      current.map((choice) =>
        choice.id === id ? { ...choice, ...patch } : choice,
      ),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {field
              ? t("navigation:tables.fieldOptions", { name: field.name })
              : t("navigation:tables.addField")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("navigation:tables.fieldType")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!field && (
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("navigation:tables.newFieldName")}
              aria-label={t("navigation:tables.newFieldName")}
            />
          )}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("navigation:tables.fieldType")}
            </p>
            <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-1">
              {(field?.type === "link"
                ? ["link", ...EDITABLE_FIELD_TYPES]
                : EDITABLE_FIELD_TYPES
              ).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={option === "link"}
                  data-selected={type === option}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 data-[selected=true]:bg-accent",
                  )}
                  onClick={() => setType(option as DataTableFieldType)}
                >
                  <FieldTypeIcon type={option} />
                  <span className="min-w-0 flex-1 truncate">
                    {t(FIELD_TYPE_LABEL_KEYS[option as DataTableFieldType])}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {(type === "select" || type === "multiselect") && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t("navigation:tables.choices")}{" "}
                {t("navigation:tables.choicesCount", { count: choices.length })}
              </p>
              <div className="space-y-1">
                {choices.map((choice) => (
                  <div key={choice.id} className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={choice.color}
                      aria-label={t("navigation:tables.choiceLabel")}
                      onChange={(event) =>
                        updateChoice(choice.id, { color: event.target.value })
                      }
                      className="size-8 shrink-0 cursor-pointer rounded-md border"
                    />
                    <Input
                      value={choice.label}
                      onChange={(event) =>
                        updateChoice(choice.id, { label: event.target.value })
                      }
                      placeholder={t("navigation:tables.choiceLabel")}
                      aria-label={t("navigation:tables.choiceLabel")}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("navigation:tables.deleteField")}
                      onClick={() =>
                        setChoices((current) =>
                          current.filter((item) => item.id !== choice.id),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-1.5"
                onClick={() =>
                  setChoices((current) => [
                    ...current,
                    {
                      id: makeChoiceId(),
                      label: "",
                      color: palette(current.length),
                    },
                  ])
                }
              >
                <Plus className="size-3.5" /> {t("navigation:tables.addChoice")}
              </Button>
            </div>
          )}

          {(type === "number" || type === "percent") && (
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                min={0}
                max={8}
                value={precision}
                onChange={(event) => setPrecision(event.target.value)}
                placeholder={t("navigation:tables.optionPrecision")}
                aria-label={t("navigation:tables.optionPrecision")}
              />
              <Input
                type="number"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                placeholder={t("navigation:tables.optionMin")}
                aria-label={t("navigation:tables.optionMin")}
              />
              <Input
                type="number"
                value={max}
                onChange={(event) => setMax(event.target.value)}
                placeholder={t("navigation:tables.optionMax")}
                aria-label={t("navigation:tables.optionMax")}
              />
            </div>
          )}

          {type === "currency" && (
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t("navigation:tables.currencyCode")}
              aria-label={t("navigation:tables.currencyCode")}
            />
          )}

          <span className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={required}
              onCheckedChange={(checked) => setRequired(checked === true)}
              aria-label={t("navigation:tables.optionRequired")}
            />
            {t("navigation:tables.optionRequired")}
          </span>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("navigation:tables.cancel")}
          </Button>
          <Button type="button" disabled={saveDisabled} onClick={save}>
            {field
              ? t("navigation:tables.editField")
              : t("navigation:tables.createAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
