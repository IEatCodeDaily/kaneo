import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DataTableField } from "@/types/data-table";
import { FieldTypeIcon, type MemberOption } from "./data-table-cells";
import { FIELD_TYPE_LABEL_KEYS, fieldIsRequired } from "./data-table-format";
import { FieldValueEditor } from "./field-value-editor";

/** Mounted per opening: cancelling never leaks drafts into the next row. */
export function NewRowDialog({
  tableName,
  fields,
  members,
  initialValues,
  onCreate,
  onOpenChange,
}: {
  tableName: string;
  fields: DataTableField[];
  members: Map<string, MemberOption>;
  initialValues: Record<string, unknown>;
  onCreate: (values: Record<string, unknown>) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(
      fields
        .filter((field) => field.type === "checkbox")
        .map((field) => [field.id, false]),
    ),
    ...Object.fromEntries(
      fields
        .filter((field) => Object.hasOwn(field.options ?? {}, "defaultValue"))
        .map((field) => [
          field.id,
          structuredClone(field.options?.defaultValue),
        ]),
    ),
    ...initialValues,
  }));
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    const missing = fields.find((field) => {
      const value = values[field.id];
      return (
        fieldIsRequired(field) &&
        (value == null ||
          (typeof value === "string" && !value.trim()) ||
          (Array.isArray(value) && !value.length))
      );
    });
    if (missing)
      return setError(
        t("navigation:tables.requiredField", { field: missing.name }),
      );
    if (Object.values(invalid).some(Boolean))
      return setError(t("navigation:tables.fixInvalidFields"));
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreate(values);
      onOpenChange(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("navigation:tables.addRowError"),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !pending.current && onOpenChange(open)}
    >
      <DialogContent
        initialFocus={() =>
          formRef.current?.querySelector<HTMLElement>(
            'input, textarea, [role="button"], button',
          ) ?? null
        }
      >
        <form
          ref={formRef}
          noValidate
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              event.target instanceof HTMLInputElement &&
              event.target.type !== "checkbox"
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="truncate">
              {t("navigation:tables.newRow")} · {tableName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {fields.map((field) => {
              return (
                <fieldset
                  key={field.id}
                  aria-label={field.name}
                  className="flex min-w-0 flex-col gap-2"
                >
                  <div className="flex min-w-0 items-center gap-1.5 text-ui font-medium">
                    <FieldTypeIcon type={field.type} />
                    <span className="min-w-0 break-words">{field.name}</span>
                    {fieldIsRequired(field) && (
                      <span
                        className="text-destructive"
                        title={t("navigation:tables.optionRequired")}
                      >
                        *
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                      {t(FIELD_TYPE_LABEL_KEYS[field.type])}
                    </span>
                  </div>
                  {field.options?.description && (
                    <p className="text-xs text-muted-foreground">
                      {field.options.description}
                    </p>
                  )}
                  <FieldValueEditor
                    field={field}
                    value={values[field.id]}
                    members={members}
                    onChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        [field.id]: value,
                      }))
                    }
                    onInvalidChange={(invalid) =>
                      setInvalid((current) => ({
                        ...current,
                        [field.id]: invalid,
                      }))
                    }
                  />
                </fieldset>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="text-ui text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              className="h-8"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {t("navigation:tables.cancel")}
            </Button>
            <Button type="submit" className="h-8" disabled={busy}>
              {t(
                busy
                  ? "navigation:tables.creating"
                  : "navigation:tables.createRow",
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
