import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Globe, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { ErrorView } from "@/components/public-board/error-view";
import { KaneoBranding } from "@/components/public-board/kaneo-branding";
import { LoadingSkeleton } from "@/components/public-board/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl } from "@/fetchers/get-api-url";

export const Route = createFileRoute("/public-form/$slug")({
  component: PublicFormPage,
});

type PublicFormField = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description: string | null;
  choices?: { id: string; label: string; color?: string }[];
  currencyCode?: string;
  precision?: number;
};

type PublicForm = { name: string; fields: PublicFormField[] };

function PublicFormPage() {
  const { slug } = Route.useParams();
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const form = useQuery({
    queryKey: ["public-form", slug],
    queryFn: async () => {
      const response = await fetch(getApiUrl(`/public-form/${slug}`));
      if (!response.ok) throw new Error("unavailable");
      return (await response.json()) as PublicForm;
    },
    retry: false,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(getApiUrl(`/public-form/${slug}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: prepared(values, form.data?.fields ?? []),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  function Shell({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <>
        <PageTitle title={title} />
        <div className="min-h-screen bg-background flex flex-col w-full">
          <header className="border-b border-border sticky top-0 z-10 bg-background">
            <div className="px-6 py-2.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-semibold text-foreground truncate">
                  {title}
                </h1>
                <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded-sm font-medium shrink-0">
                  {t("navigation:tables.publicForm")}
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 flex justify-center p-6">{children}</main>
        </div>
      </>
    );
  }

  if (form.isPending) {
    return (
      <Shell title="">
        <LoadingSkeleton />
      </Shell>
    );
  }

  if (form.isError || !form.data) {
    return (
      <Shell title={t("navigation:tables.formUnavailable")}>
        <div className="w-full max-w-md">
          <ErrorView />
        </div>
      </Shell>
    );
  }

  if (submit.isSuccess) {
    return (
      <Shell title={form.data.name}>
        <div className="w-full max-w-md mt-8 flex flex-col items-center gap-2 rounded-lg border border-border p-8 text-center">
          <Check className="size-8 text-emerald-600" />
          <p className="text-sm">{t("navigation:tables.formSuccess")}</p>
          <KaneoBranding />
        </div>
      </Shell>
    );
  }

  const set = (field: PublicFormField, value: unknown) => {
    setLocalError(null);
    setValues((current) => ({ ...current, [field.id]: value }));
  };

  const handleSubmit = () => {
    for (const field of form.data.fields) {
      const value = values[field.id];
      if (
        field.required &&
        (value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0))
      ) {
        setLocalError(t("navigation:tables.formRequired"));
        return;
      }
    }
    submit.mutate();
  };

  return (
    <Shell title={form.data.name}>
      <div className="flex w-full max-w-md flex-col gap-4 mt-8">
        <h1 className="text-lg font-semibold">{form.data.name}</h1>
        {localError && (
          <p className="text-sm text-destructive-foreground" role="alert">
            {localError}
          </p>
        )}
        {submit.isError && (
          <p className="text-sm text-destructive-foreground" role="alert">
            {t("navigation:tables.formError")}
          </p>
        )}
        {form.data.fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <Label htmlFor={field.id}>
              {field.name}
              {field.required && <span aria-hidden> *</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
            <FieldInput
              field={field}
              value={values[field.id]}
              onChange={(value) => set(field, value)}
            />
          </div>
        ))}
        <Button onClick={handleSubmit} disabled={submit.isPending}>
          {submit.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {submit.isPending
            ? t("navigation:tables.formSubmitting")
            : t("navigation:tables.formSubmit")}
        </Button>
        <KaneoBranding />
      </div>
    </Shell>
  );
}

function prepared(values: Record<string, unknown>, fields: PublicFormField[]) {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === "" || value === null) continue;
    if (
      field.type === "number" ||
      field.type === "percent" ||
      field.type === "currency"
    )
      out[field.id] = Number(value);
    else if (field.type === "datetime" && typeof value === "string")
      out[field.id] = new Date(value).toISOString();
    else out[field.id] = value;
  }
  return out;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PublicFormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "longtext":
      return (
        <Textarea
          id={field.id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "number":
    case "percent":
    case "currency":
      return (
        <Input
          id={field.id}
          type="number"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "date":
      return (
        <Input
          id={field.id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "datetime":
      return (
        <Input
          id={field.id}
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          id={field.id}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : null}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={field.id} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.choices ?? []).map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect":
      return (
        <div className="flex flex-col gap-1">
          {(field.choices ?? []).map((choice) => {
            const list = Array.isArray(value) ? (value as string[]) : [];
            const checked = list.includes(choice.id);
            return (
              <label
                key={choice.id}
                className="flex items-center gap-2 text-sm"
                htmlFor={`pf-${field.id}-${choice.id}`}
              >
                <Checkbox
                  id={`pf-${field.id}-${choice.id}`}
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(
                      next === true
                        ? [...list, choice.id]
                        : list.filter((id) => id !== choice.id),
                    )
                  }
                />
                {choice.label}
              </label>
            );
          })}
        </div>
      );
    default:
      return (
        <Input
          id={field.id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
