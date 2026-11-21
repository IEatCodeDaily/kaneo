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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useDataTableMutations,
  useDataTables,
} from "@/hooks/data-table/use-data-tables";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { toast } from "@/lib/toast";
import type {
  DataTableField,
  DataTableFieldOptions,
  DataTableFieldType,
  SelectChoice,
} from "@/types/data-table";
import type { MemberOption } from "./data-table-cells";
import {
  fieldIsRequired,
  makeChoiceId,
  optionsForType,
  typeChangeKeepsValues,
} from "./data-table-format";
import { FieldTypeConfirmation } from "./field-type-confirmation";
import { FieldTypePicker } from "./field-type-picker";
import { FieldValueEditor } from "./field-value-editor";

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
  members?: Map<string, MemberOption>;
};

type LinkCardinality = NonNullable<DataTableFieldOptions["cardinality"]>;

// Display order; the values are the stored cardinality — the submit payload
// is unchanged from the old radio rows.
const LINK_CARDINALITIES: LinkCardinality[] = [
  "many-to-one",
  "one-to-many",
  "one-to-one",
  "many-to-many",
];

/** Mini relation diagram: N bars → connector → M bars (1 tall bar = one,
 *  3 short ticks = many; ticks sit 4 units apart so they never merge). */
const RELATION_GLYPHS: Record<LinkCardinality, string[]> = {
  "many-to-one": ["M2 10v4", "M6 10v4", "M10 10v4", "M6 12h14", "M20 8v8"],
  "one-to-many": ["M4 8v8", "M4 12h14", "M14 10v4", "M18 10v4", "M22 10v4"],
  "one-to-one": ["M4 8v8", "M4 12h16", "M20 8v8"],
  "many-to-many": [
    "M2 10v4",
    "M6 10v4",
    "M10 10v4",
    "M6 12h12",
    "M14 10v4",
    "M18 10v4",
    "M22 10v4",
  ],
};

function RelationGlyph({ kind }: { kind: LinkCardinality }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-5 shrink-0"
    >
      {RELATION_GLYPHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const palette = (index: number) =>
  CHOICE_PALETTE[index % CHOICE_PALETTE.length];

export default function FieldOptionsDialog({
  organizationId,
  tableId,
  open,
  onOpenChange,
  field,
  initialType,
  members = new Map(),
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
  const [description, setDescription] = useState("");
  const [allowTeams, setAllowTeams] = useState(false);
  const [defaultValue, setDefaultValue] = useState<unknown>(undefined);
  const [defaultInvalid, setDefaultInvalid] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [multiple, setMultiple] = useState(true);
  const [confirmType, setConfirmType] = useState(false);
  const [targetTableId, setTargetTableId] = useState("");
  const [cardinality, setCardinality] =
    useState<NonNullable<DataTableFieldOptions["cardinality"]>>("many-to-one");
  const [inverseName, setInverseName] = useState("");
  const { data: tables = [] } = useDataTables(
    organizationId,
    open && type === "link",
  );
  const localName =
    tables.find((table) => table.id === tableId)?.name ??
    t("navigation:tables.linkThisTable");
  const targetName =
    tables.find((table) => table.id === targetTableId)?.name ??
    t("navigation:tables.linkTargetTable");
  const { data: boards = [] } = useGetBoards({
    organizationId: type === "ticket" ? organizationId : "",
  });

  useEffect(() => {
    if (!open) return;
    const options: DataTableFieldOptions = field?.options ?? {};
    setName(field?.name ?? "");
    setDescription(options.description ?? "");
    setAllowTeams(options.allowTeams === true);
    setDefaultValue(
      initialType && initialType !== field?.type
        ? undefined
        : options.defaultValue,
    );
    setDefaultInvalid(false);
    setEditorVersion((version) => version + 1);
    setType(initialType ?? field?.type ?? "text");
    setChoices(options.choices ? options.choices.map((c) => ({ ...c })) : []);
    setPrecision(
      typeof options.precision === "number" ? String(options.precision) : "",
    );
    setMin(typeof options.min === "number" ? String(options.min) : "");
    setMax(typeof options.max === "number" ? String(options.max) : "");
    setCode(options.code ?? "");
    setRequired(field ? fieldIsRequired(field) : false);
    setBoardIds(options.boardIds ?? []);
    setMultiple(options.multiple !== false);
    setTargetTableId(options.targetTableId ?? "");
    setInverseName("");
    setCardinality("many-to-one");
    setConfirmType(false);
  }, [open, field, initialType]);

  const buildOptions = (): DataTableFieldOptions | undefined => {
    if (type === "link")
      return field?.type === "link"
        ? (field.options ?? undefined)
        : {
            targetTableId,
            cardinality,
            ...(inverseName.trim() ? { inverseName: inverseName.trim() } : {}),
          };
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
    if (type === "ticket") {
      if (boardIds.length > 0) draft.boardIds = boardIds;
      else delete draft.boardIds;
      if (!multiple) draft.multiple = false;
      else delete draft.multiple;
    }
    if (type === "user") draft.allowTeams = allowTeams;
    if (description.trim()) draft.description = description.trim();
    else delete draft.description;
    if (defaultValue !== undefined && defaultValue !== null)
      draft.defaultValue = defaultValue;
    if (required) draft.required = true;
    else delete draft.required;
    return draft;
  };

  const optionsValid =
    (type !== "link" || Boolean(targetTableId)) &&
    (!field || (type === "link") === (field.type === "link")) &&
    (type !== "currency" || code.trim() !== "") &&
    (type !== "select" && type !== "multiselect"
      ? true
      : choices.some((choice) => choice.label.trim() !== ""));

  const saveDisabled =
    createField.isPending ||
    updateField.isPending ||
    name.trim() === "" ||
    defaultInvalid ||
    !optionsValid;

  const save = async (confirmed = false): Promise<boolean> => {
    if (saveDisabled) return false;
    if (field && type !== field.type && !confirmed) {
      setConfirmType(true);
      return false;
    }
    const options = buildOptions();
    try {
      if (field) {
        await updateField.mutateAsync({
          organizationId,
          tableId,
          fieldId: field.id,
          name: name.trim(),
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
      setConfirmType(false);
      onOpenChange(false);
      return true;
    } catch {
      toast.error(
        t(
          field
            ? "navigation:tables.renameFieldError"
            : "navigation:tables.addFieldError",
        ),
      );
      return false;
    }
  };

  const updateChoice = (id: string, patch: Partial<SelectChoice>) =>
    setChoices((current) =>
      current.map((choice) =>
        choice.id === id ? { ...choice, ...patch } : choice,
      ),
    );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
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
            <div className="space-y-2">
              <label
                htmlFor="field-name"
                className="text-xs font-medium text-muted-foreground"
              >
                {t("navigation:tables.fieldName")}
              </label>
              <Input
                id="field-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("navigation:tables.newFieldName")}
                aria-label={t("navigation:tables.newFieldName")}
              />
            </div>
            <FieldTypePicker
              value={type}
              onChange={(next) => {
                if (next === type) return;
                setType(next);
                setDefaultValue(undefined);
                setDefaultInvalid(false);
                setEditorVersion((version) => version + 1);
              }}
            />
            {type === "link" && (
              <section
                className="space-y-3"
                aria-label={t("navigation:tables.linkSettings")}
              >
                <label htmlFor="link-target-table" className="block space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("navigation:tables.linkTargetTable")}
                  </span>
                  <Select
                    items={tables.map((table) => ({
                      value: table.id,
                      label: table.name,
                    }))}
                    value={targetTableId || null}
                    onValueChange={(value) => setTargetTableId(value ?? "")}
                    disabled={Boolean(field)}
                  >
                    <SelectTrigger
                      id="link-target-table"
                      className="w-full"
                      aria-label={t("navigation:tables.linkTargetTable")}
                    >
                      <SelectValue
                        placeholder={t("navigation:tables.linkTargetTable")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((table) => (
                        <SelectItem
                          key={table.id}
                          value={table.id}
                          disabled={table.canEdit === false}
                        >
                          {table.name}
                          {table.id === tableId
                            ? ` · ${t("navigation:tables.linkThisTable")}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {!field && (
                  <>
                    <div
                      className="space-y-1"
                      role="radiogroup"
                      aria-label={t("navigation:tables.linkRelationship")}
                    >
                      <TooltipProvider delay={0}>
                        <div className="grid grid-cols-2 gap-1">
                          {LINK_CARDINALITIES.map((kind) => (
                            <Tooltip key={kind}>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="outline"
                                    role="radio"
                                    aria-checked={cardinality === kind}
                                    className="h-auto justify-start gap-2 px-2 py-2 text-left aria-checked:border-ring aria-checked:bg-accent"
                                    onClick={() => setCardinality(kind)}
                                  />
                                }
                              >
                                <RelationGlyph kind={kind} />
                                <span className="min-w-0 truncate text-xs font-semibold">
                                  {t(
                                    `navigation:tables.linkCardinality.${kind}`,
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64">
                                {t(`navigation:tables.linkSentence.${kind}`, {
                                  source: localName,
                                  target: targetName,
                                })}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                      {/* Tooltips don't open on touch, so the selected
                        relation's sentence stays visible under the selector. */}
                      <p className="px-1 text-xs text-muted-foreground">
                        {t(`navigation:tables.linkSentence.${cardinality}`, {
                          source: localName,
                          target: targetName,
                        })}
                      </p>
                    </div>
                    <label
                      htmlFor="link-inverse-name"
                      className="block space-y-2"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("navigation:tables.linkInverseName")}
                      </span>
                      <Input
                        id="link-inverse-name"
                        value={inverseName}
                        onChange={(event) => setInverseName(event.target.value)}
                        placeholder={localName}
                        aria-label={t("navigation:tables.linkInverseName")}
                      />
                    </label>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("navigation:tables.linkReciprocalSummary", {
                    source: localName,
                    target: targetName,
                    name: inverseName.trim() || localName,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("navigation:tables.linkMutualEdit")}
                </p>
              </section>
            )}
            {[
              "select",
              "multiselect",
              "number",
              "percent",
              "currency",
              "ticket",
              "user",
            ].includes(type) && (
              <section
                aria-label={t("navigation:tables.typeSettings")}
                className="space-y-3"
              >
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t("navigation:tables.typeSettings")}
                </h3>
                {(type === "select" || type === "multiselect") && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {t("navigation:tables.choices")}{" "}
                      {t("navigation:tables.choicesCount", {
                        count: choices.length,
                      })}
                    </p>
                    <div className="space-y-1">
                      {choices.map((choice) => (
                        <div
                          key={choice.id}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="color"
                            value={choice.color}
                            aria-label={t("navigation:tables.choiceLabel")}
                            onChange={(event) =>
                              updateChoice(choice.id, {
                                color: event.target.value,
                              })
                            }
                            className="size-8 shrink-0 cursor-pointer rounded-md border"
                          />
                          <Input
                            value={choice.label}
                            onChange={(event) =>
                              updateChoice(choice.id, {
                                label: event.target.value,
                              })
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
                      className="mt-1"
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
                      <Plus className="size-3.5" />{" "}
                      {t("navigation:tables.addChoice")}
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

                {type === "ticket" && (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("navigation:tables.ticketBoards")}
                      </p>
                      <div className="flex flex-col gap-1 rounded-lg border p-1">
                        <label className="flex h-7 items-center gap-2 rounded-md px-2 text-ui hover:bg-accent">
                          <input
                            type="radio"
                            name="ticket-scope"
                            checked={boardIds.length === 0}
                            onChange={() => setBoardIds([])}
                          />
                          {t("navigation:tables.ticketAnyBoard")}
                        </label>
                        <label className="flex h-7 items-center gap-2 rounded-md px-2 text-ui hover:bg-accent">
                          <input
                            type="radio"
                            name="ticket-scope"
                            checked={boardIds.length > 0}
                            onChange={() =>
                              boardIds.length === 0 &&
                              boards[0] &&
                              setBoardIds([boards[0].id])
                            }
                          />
                          {t("navigation:tables.ticketSelectedBoards")}
                        </label>
                        {boardIds.length > 0 && (
                          <div className="flex max-h-36 flex-col overflow-y-auto pl-6">
                            {boards.map((board) => (
                              <span
                                key={board.id}
                                className="flex h-7 items-center gap-2 text-ui"
                              >
                                <Checkbox
                                  checked={boardIds.includes(board.id)}
                                  aria-label={board.name}
                                  onCheckedChange={(checked) =>
                                    setBoardIds((current) =>
                                      checked === true
                                        ? [...current, board.id]
                                        : current.filter(
                                            (id) => id !== board.id,
                                          ),
                                    )
                                  }
                                />
                                <span className="min-w-0 truncate">
                                  {board.name}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("navigation:tables.ticketCount")}
                      </p>
                      <div className="flex gap-1">
                        {[
                          [true, "navigation:tables.ticketMany"],
                          [false, "navigation:tables.ticketSingle"],
                        ].map(([value, label]) => (
                          <Button
                            key={String(value)}
                            type="button"
                            size="sm"
                            variant={multiple === value ? "secondary" : "ghost"}
                            aria-pressed={multiple === value}
                            onClick={() => setMultiple(value as boolean)}
                          >
                            {t(label as string)}
                          </Button>
                        ))}
                      </div>
                    </div>
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

                {type === "user" && (
                  <label
                    htmlFor="field-allow-teams"
                    className="flex items-center justify-between gap-2 text-ui"
                  >
                    <span>{t("navigation:tables.allowTeams")}</span>
                    <Switch
                      id="field-allow-teams"
                      checked={allowTeams}
                      onCheckedChange={setAllowTeams}
                    />
                  </label>
                )}
              </section>
            )}
            {type !== "link" && (
              <section
                className="space-y-2"
                aria-label={t("navigation:tables.defaultValue")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t("navigation:tables.defaultValue")}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setDefaultValue(undefined);
                      setDefaultInvalid(false);
                      setEditorVersion((version) => version + 1);
                    }}
                  >
                    {t("navigation:tables.clearDefault")}
                  </Button>
                </div>
                <FieldValueEditor
                  key={editorVersion}
                  field={{
                    id: "draft",
                    tableId,
                    name: t("navigation:tables.defaultValue"),
                    type,
                    options: { ...buildOptions(), required: false },
                    position: 0,
                    createdAt: "",
                    updatedAt: "",
                  }}
                  value={defaultValue}
                  members={members}
                  onChange={setDefaultValue}
                  onInvalidChange={setDefaultInvalid}
                />
                <p className="text-xs text-muted-foreground">
                  {t("navigation:tables.defaultHelp")}
                </p>
              </section>
            )}
            {field && type !== field.type && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 p-2 text-xs text-destructive-foreground"
              >
                {t(
                  typeChangeKeepsValues(field.type, type)
                    ? "navigation:tables.changeTypeConvert"
                    : "navigation:tables.changeTypeClears",
                )}
              </p>
            )}

            <section
              className="space-y-3 border-t pt-3"
              aria-label={t("navigation:tables.fieldOptionsSection")}
            >
              <h3 className="text-xs font-medium text-muted-foreground">
                {t("navigation:tables.fieldOptionsSection")}
              </h3>
              <label
                htmlFor="field-required"
                className="flex items-center justify-between gap-2 text-ui"
              >
                <span>{t("navigation:tables.optionRequired")}</span>
                <Switch
                  id="field-required"
                  disabled={type === "link"}
                  checked={type !== "link" && required}
                  onCheckedChange={setRequired}
                />
              </label>
              <label
                htmlFor="field-description"
                className="flex flex-col gap-2 text-ui"
              >
                {t("navigation:tables.fieldDescription")}
                <Textarea
                  id="field-description"
                  value={description}
                  rows={2}
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-label={t("navigation:tables.fieldDescription")}
                />
              </label>
            </section>
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="h-8"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("navigation:tables.cancel")}
            </Button>
            <Button
              type="button"
              className="h-8"
              disabled={saveDisabled}
              onClick={() => {
                void save();
              }}
            >
              {field
                ? t("navigation:tables.editField")
                : t("navigation:tables.addField")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {field && confirmType && open && (
        <FieldTypeConfirmation
          key={`${field.id}:${type}`}
          field={field}
          nextType={type}
          open
          onOpenChange={setConfirmType}
          onConfirm={() => save(true)}
        />
      )}
    </>
  );
}
