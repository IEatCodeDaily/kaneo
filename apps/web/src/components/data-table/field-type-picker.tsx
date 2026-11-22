import { Check, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DataTableFieldType } from "@/types/data-table";
import { FieldTypeIcon } from "./data-table-cells";
import { FIELD_TYPE_LABEL_KEYS } from "./data-table-format";

const GROUPS: { key: string; types: DataTableFieldType[] }[] = [
  { key: "text", types: ["text", "longtext", "email", "url"] },
  { key: "number", types: ["number", "percent", "currency"] },
  { key: "date", types: ["date", "datetime"] },
  { key: "choice", types: ["select", "multiselect", "checkbox"] },
  { key: "people", types: ["user", "ticket", "link", "lookup"] },
  { key: "advanced", types: ["json"] },
];

export function FieldTypePicker({
  value,
  onChange,
}: {
  value: DataTableFieldType;
  onChange: (type: DataTableFieldType) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const mobile = useIsMobile();
  const groups = GROUPS.map((group) => ({
    ...group,
    types: group.types.filter((type) =>
      `${t(FIELD_TYPE_LABEL_KEYS[type])} ${t(`navigation:tables.fieldTypeHelp.${type}`)} ${t(`navigation:tables.fieldTypeGroup.${group.key}`)}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ),
  })).filter((group) => group.types.length);
  return (
    <section
      aria-label={t("navigation:tables.fieldType")}
      className="space-y-2"
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLInputElement &&
          ["Home", "End"].includes(event.key)
        )
          return;
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button[data-field-type]:not(:disabled)",
          ),
        ].filter((button) => button.closest("details")?.open);
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (current +
                  (event.key === "ArrowUp" ? -1 : 1) +
                  buttons.length) %
                buttons.length;
        buttons[index]?.focus();
      }}
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 z-10 size-4 text-muted-foreground" />
        <Input
          className="[&_input]:pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t("navigation:tables.searchFieldTypes")}
          placeholder={t("navigation:tables.searchFieldTypes")}
        />
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border p-2 sm:max-h-72">
        {groups.map((group) => (
          <details
            key={`${group.key}:${Boolean(search)}`}
            open={!mobile || Boolean(search) || group.types.includes(value)}
            className="group/type"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-medium text-muted-foreground md:pointer-events-none">
              {t(`navigation:tables.fieldTypeGroup.${group.key}`)}
              <ChevronDown className="size-3 transition-transform group-open/type:rotate-180 md:hidden" />
            </summary>
            <div className="hidden space-y-1 group-open/type:block md:block">
              {group.types.map((type) => (
                <Button
                  key={type}
                  data-field-type={type}
                  variant="ghost"
                  type="button"
                  aria-pressed={value === type}
                  aria-label={
                    type === "link"
                      ? t("navigation:tables.linkToTable")
                      : t(FIELD_TYPE_LABEL_KEYS[type])
                  }
                  onClick={() => onChange(type)}
                  className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 py-2 text-left aria-pressed:bg-accent"
                >
                  <FieldTypeIcon type={type} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui font-medium">
                      {type === "link"
                        ? t("navigation:tables.linkToTable")
                        : t(FIELD_TYPE_LABEL_KEYS[type])}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t(`navigation:tables.fieldTypeHelp.${type}`)}
                    </span>
                  </span>
                  {value === type && <Check className="size-4 shrink-0" />}
                </Button>
              ))}
            </div>
          </details>
        ))}
        {!groups.length && (
          <p className="p-2 text-ui text-muted-foreground">
            {t("navigation:tables.noFieldTypes")}
          </p>
        )}
      </div>
      {!search && (
        <p className="text-xs text-muted-foreground">
          {t("navigation:tables.browseFieldTypes")}
        </p>
      )}
    </section>
  );
}
