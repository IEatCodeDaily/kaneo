import { useTranslation } from "react-i18next";
import { Kbd } from "@/components/ui/kbd";
import { getModifierKeyText } from "@/hooks/use-keyboard-shortcuts";
import { parseSearchQuery } from "../../../../../apps/api/src/search/query";

export function SearchShortcut() {
  const modifier = getModifierKeyText();
  return <Kbd>{modifier === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>;
}

export function SearchHelp() {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-2 border-b p-3 text-muted-foreground text-xs"
      data-testid="search-help"
    >
      <p className="font-medium text-foreground">
        {t("navigation:search.helpTitle", {
          defaultValue: "Find tickets and more",
        })}
      </p>
      <p>
        {t("navigation:search.helpKeys", {
          defaultValue: "Words in any order, or a key:",
        })}{" "}
        <code>KFL-123</code>, <code>#123</code>, <code>123</code>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[
          "is:open · is:closed · is:done",
          "status:in-progress",
          "assignee:me",
          "board:KFL",
          "label:bug",
          "priority:high",
          "type:ticket · type:board · type:repo",
          "type:issue · type:pr · type:comment",
        ].map((example) => (
          <code key={example}>{example}</code>
        ))}
      </div>
      <p>
        {t("navigation:search.helpQuotes", {
          defaultValue: "Quote names with spaces:",
        })}{" "}
        <code>assignee:"Ayu Saraswati"</code>
      </p>
    </div>
  );
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = parseSearchQuery(query).terms;
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "ig",
  );
  let offset = 0;
  return (
    <>
      {text.split(pattern).map((part) => {
        const position = offset;
        offset += part.length;
        return terms.includes(part.toLowerCase()) ? (
          <mark
            className="rounded-sm bg-primary-soft text-primary-soft-foreground"
            key={position}
          >
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

export function searchSnippet(text: string, query: string) {
  const plain = text
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*`]/g, "")
    .replace(/\s+/g, " ");
  const positions = parseSearchQuery(query)
    .terms.map((term) => plain.toLowerCase().indexOf(term))
    .filter((index) => index >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 40) : 0;
  return `${start ? "…" : ""}${plain.slice(start, start + 180)}${plain.length > start + 180 ? "…" : ""}`;
}
