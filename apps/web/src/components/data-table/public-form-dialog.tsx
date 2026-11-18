import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldTypeIcon } from "@/components/data-table/data-table-cells";
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
  publishTableForm,
  revokeTableForm,
} from "@/fetchers/data-table/data-table";
import { dataTableKeys } from "@/hooks/data-table/use-data-tables";
import { toast } from "@/lib/toast";
import type { DataTableField, DataTableSummary } from "@/types/data-table";

// Anonymous submissions only support self-service field types: user/json/
// link/ticket need session or org context the public form does not have.
const FORM_FILLABLE_TYPES = new Set([
  "text",
  "longtext",
  "number",
  "percent",
  "currency",
  "date",
  "datetime",
  "select",
  "multiselect",
  "checkbox",
  "url",
  "email",
]);

export default function PublicFormDialog({
  organizationId,
  table,
  fields,
  open,
  onOpenChange,
}: {
  organizationId: string;
  table: DataTableSummary;
  fields: DataTableField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fillable = fields.filter(
    (field) => !field.system && FORM_FILLABLE_TYPES.has(field.type),
  );
  const [selected, setSelected] = useState<string[]>(
    () => table.formFields ?? [],
  );
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: dataTableKeys.detail(organizationId, table.id),
    });

  const publish = async () => {
    setBusy(true);
    try {
      await publishTableForm({ organizationId, tableId: table.id }, selected);
      invalidate();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await revokeTableForm({ organizationId, tableId: table.id });
      setSelected([]);
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const link = table.formSlug
    ? `${window.location.origin}/public-form/${table.formSlug}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("navigation:tables.publicForm")}</DialogTitle>
          <DialogDescription>
            {t("navigation:tables.publicFormDesc")}
          </DialogDescription>
        </DialogHeader>
        {link && (
          <div className="flex items-center gap-1">
            <Input
              value={link}
              readOnly
              aria-label={t("navigation:tables.publicFormLink")}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied
                ? t("navigation:tables.publicFormCopied")
                : t("navigation:tables.publicFormCopy")}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("navigation:tables.publicFormFieldsTitle")}
        </p>
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {fillable.map((field) => {
            const checked = selected.includes(field.id);
            return (
              <label
                key={field.id}
                className="flex h-7 items-center gap-2 rounded-md px-2 text-ui hover:bg-accent"
                htmlFor={`public-form-field-${field.id}`}
              >
                <Checkbox
                  id={`public-form-field-${field.id}`}
                  checked={checked}
                  onCheckedChange={(next) =>
                    setSelected(
                      next
                        ? [...selected, field.id]
                        : selected.filter((id) => id !== field.id),
                    )
                  }
                  aria-label={field.name}
                />
                <FieldTypeIcon
                  type={field.type}
                  className="text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{field.name}</span>
              </label>
            );
          })}
        </div>
        <DialogFooter>
          {table.formSlug && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => revoke()}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {t("navigation:tables.publicFormRevoke")}
            </Button>
          )}
          <Button
            size="sm"
            disabled={busy || selected.length === 0}
            onClick={() => publish()}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            <Globe className="size-3.5" />
            {table.formSlug
              ? t("navigation:tables.publicFormUpdate")
              : t("navigation:tables.publicFormPublish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
