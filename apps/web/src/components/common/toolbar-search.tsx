import { Search, X } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ToolbarSearch({
  label,
  value,
  onChange,
  clearLabel,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clearLabel: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div
      data-toolbar-search=""
      className="flex h-7 w-28 @3xl/toolbar:w-50 min-w-0 shrink items-center gap-1.5 rounded-md border border-input bg-background px-2 focus-within:ring-2 focus-within:ring-ring"
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        ref={inputRef}
        unstyled
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        className="min-w-0 flex-1 [&_[data-slot=input]]:h-6 [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:text-xs [&_[data-slot=input]]:leading-6"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-4 sm:size-4"
          aria-label={clearLabel}
          onClick={() => onChange("")}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
