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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CsvImportResult,
  importTableCsv,
} from "@/fetchers/data-table/data-table";
import type { DataTableField, DataTableTarget } from "@/types/data-table";
import { csvParse } from "./data-table-csv";

export function CsvImportDialog({
  csv,
  fields,
  target,
  onClose,
  onImported,
}: {
  csv: string;
  fields: DataTableField[];
  target: DataTableTarget;
  onClose: () => void;
  onImported: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const parsed = csvParse(csv.replace(/^\uFEFF/, ""));
  const headers = parsed[0] ?? [];
  const [mapping, setMapping] = useState<(string | null)[]>(() =>
    headers.map(
      (name) =>
        fields.find(
          (f) =>
            !f.system &&
            f.name.toLowerCase() ===
              name
                .replace(/^'(?=[=+\-@\t\r'])/, "")
                .trim()
                .toLowerCase(),
        )?.id ?? null,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  const run = async (preview: boolean) => {
    if (pending.current) return;
    pending.current = true;
    cancelled.current = false;
    setBusy(true);
    setMessage("");
    setProgress(0);
    setResult(null);
    setFinished(false);
    let created = 0;
    let offset = 0;
    let total = 0;
    const errors: CsvImportResult["errors"] = [];
    try {
      do {
        const batch = await importTableCsv(target, {
          csv,
          mapping,
          offset,
          preview,
        });
        total = batch.total;
        offset += batch.checked;
        created += batch.created;
        errors.push(...batch.errors);
        // Every line in a rejected batch failed to import, even when its own cells were valid.
        setProgress(offset);
        setResult({ created, checked: offset, total, errors: [...errors] });
        if (!batch.checked) break;
      } while (offset < total && !cancelled.current);
      setValidated(preview && !cancelled.current);
      setFinished(!preview);
      setMessage(
        t(
          cancelled.current
            ? "navigation:tables.csvCancelled"
            : preview
              ? "navigation:tables.csvPreviewComplete"
              : "navigation:tables.csvComplete",
        ),
      );
    } catch (error) {
      setValidated(false);
      setMessage(
        `${t("navigation:tables.csvRequestError")} ${error instanceof Error ? error.message : ""}`,
      );
      setFinished(!preview);
    } finally {
      try {
        if (!preview) await onImported();
      } finally {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("navigation:tables.csvPreview")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("navigation:tables.csvAtomicity")}
        </p>
        <fieldset
          className="space-y-2"
          aria-label={t("navigation:tables.csvMapping")}
        >
          {headers.map((header, index) => (
            <div
              // CSV column positions are immutable; duplicate headers need distinct mapping controls.
              // biome-ignore lint/suspicious/noArrayIndexKey: source columns never reorder
              key={`${index}-${header}`}
              className="grid min-w-0 grid-cols-2 items-center gap-3"
            >
              <div className="min-w-0">
                <span className="block truncate text-sm" title={header}>
                  {header ||
                    t("navigation:tables.csvUnnamed", { number: index + 1 })}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {parsed[1]?.[index] || "—"}
                </span>
              </div>
              <Select
                value={mapping[index] ?? "__exclude__"}
                disabled={busy || finished}
                onValueChange={(id) => {
                  setMapping((current) =>
                    current.map((value, i) =>
                      i === index ? (id === "__exclude__" ? null : id) : value,
                    ),
                  );
                  setValidated(false);
                  setResult(null);
                  setMessage("");
                }}
              >
                <SelectTrigger
                  className="min-w-0"
                  aria-label={t("navigation:tables.csvMapColumn", {
                    name: header,
                  })}
                >
                  <SelectValue>
                    {mapping[index]
                      ? fields.find((f) => f.id === mapping[index])?.name
                      : t("navigation:tables.csvExclude")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__exclude__">
                    {t("navigation:tables.csvExclude")}
                  </SelectItem>
                  {fields
                    .filter((f) => !f.system)
                    .map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </fieldset>
        <div role="status" aria-live="polite" className="space-y-2 text-sm">
          {message && <p>{message}</p>}
          {result && (
            <>
              <p>
                {t("navigation:tables.csvProgress", {
                  done: progress,
                  total: result.total,
                  percent: result.total
                    ? Math.round((progress / result.total) * 100)
                    : 100,
                })}
              </p>
              <p>
                {t("navigation:tables.csvCreated", { count: result.created })}
              </p>
            </>
          )}
        </div>
        {result && result.errors.length > 0 && (
          <div
            role="alert"
            className="max-h-48 overflow-auto rounded-md border border-destructive p-3 text-sm"
          >
            <p>
              {t("navigation:tables.csvFailedLines", {
                lines: [
                  ...new Set(result.errors.map((error) => error.line)),
                ].join(", "),
              })}
            </p>
            <ul>
              {result.errors.map((error) => (
                <li key={`${error.line}-${error.field}`}>
                  {t("navigation:tables.csvCellError", {
                    line: error.line,
                    field: error.field,
                    message: error.message,
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          {busy ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                cancelled.current = true;
                setMessage(t("navigation:tables.csvCancelling"));
              }}
            >
              {t("navigation:tables.csvCancel")}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onClose}>
                {t("navigation:tables.csvClose")}
              </Button>
              {!finished && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!mapping.some(Boolean)}
                    onClick={() => void run(true)}
                  >
                    {t("navigation:tables.csvValidate")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!validated}
                    onClick={() => void run(false)}
                  >
                    {t("navigation:tables.csvImport")}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
