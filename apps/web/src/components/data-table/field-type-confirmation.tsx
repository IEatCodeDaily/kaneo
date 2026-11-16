import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { DataTableField, DataTableFieldType } from "@/types/data-table";
import {
  FIELD_TYPE_LABEL_KEYS,
  typeChangeKeepsValues,
} from "./data-table-format";

/** Pointer users double-click; keyboard/assistive users activate twice. */
export function FieldTypeConfirmation({
  field,
  nextType,
  open,
  onOpenChange,
  onConfirm,
}: {
  field: DataTableField;
  nextType: DataTableFieldType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const armed = useRef(false);
  const busy = useRef(false);
  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    armed.current = false;
    setPending(true);
    try {
      if (await onConfirm()) onOpenChange(false);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy.current) return;
        armed.current = false;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("navigation:tables.changeTypeTitle", {
              name: field.name,
              type: t(FIELD_TYPE_LABEL_KEYS[nextType]),
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              typeChangeKeepsValues(field.type, nextType)
                ? "navigation:tables.changeTypeConvert"
                : "navigation:tables.changeTypeClears",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("navigation:tables.changeTypeRecoverable")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("navigation:tables.confirmTypeHint")}
        </p>
        <AlertDialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              armed.current = false;
              onOpenChange(false);
            }}
          >
            {t("navigation:tables.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onBlur={() => {
              armed.current = false;
            }}
            onDoubleClick={() => {
              void confirm();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              if (event.repeat) return;
              if (armed.current) void confirm();
              else armed.current = true;
            }}
            onKeyUp={(event) => {
              if (event.key === "Enter" || event.key === " ")
                event.preventDefault();
            }}
            onClick={(event) => {
              // detail=0 is an assistive-technology activation (no pointer).
              if (event.detail !== 0) return;
              if (armed.current) void confirm();
              else armed.current = true;
            }}
          >
            {t("navigation:tables.confirmTypeDoubleClick")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
