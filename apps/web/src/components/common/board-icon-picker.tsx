import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import icons from "@/constants/board-icons";
import { cn } from "@/lib/cn";
import { isEmojiIcon } from "@/lib/resolve-icon";
import EntityIcon from "./entity-icon";

const EMOJI_SUGGESTIONS = [
  "🚀",
  "🎯",
  "🐛",
  "🔥",
  "✨",
  "📦",
  "🧪",
  "🛠️",
  "📊",
  "🔐",
  "💡",
  "⚡",
];

type BoardIconPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  searchPlaceholder: string;
  triggerLabel: string;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  showValue?: boolean;
};

function BoardIconPicker({
  value,
  onValueChange,
  searchPlaceholder,
  triggerLabel,
  disabled = false,
  align = "start",
  showValue = false,
}: BoardIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim();
  const filteredIcons = Object.entries(icons).filter(([name]) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );

  const select = (nextValue: string) => {
    onValueChange(nextValue);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={triggerLabel}
          className={cn(
            showValue
              ? "h-8 w-auto justify-start gap-2 font-normal"
              : "h-8 w-8 p-0",
          )}
          disabled={disabled}
          size={showValue ? "sm" : "icon-sm"}
          title={triggerLabel}
          type="button"
          variant="outline"
        >
          <EntityIcon className="h-4 w-4 text-base" value={value} />
          {showValue && (
            <span className="truncate text-xs">{value || "Layout"}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-2">
        <div className="space-y-2">
          <Input
            aria-label={searchPlaceholder}
            autoFocus
            className="h-8 text-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            role="searchbox"
            value={search}
          />
          {isEmojiIcon(query) && query !== value && (
            <Button
              className="h-10 w-full justify-start gap-2 text-xs"
              onClick={() => select(query)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <span className="text-base leading-none">{query}</span>
              {query}
            </Button>
          )}
          <div className="max-h-[280px] overflow-y-auto pr-1">
            <div className="grid grid-cols-6 gap-1.5">
              {EMOJI_SUGGESTIONS.filter(() => !query || isEmojiIcon(query)).map(
                (emoji) => (
                  <Button
                    aria-label={emoji}
                    aria-pressed={value === emoji}
                    className={cn(
                      "h-10 items-center justify-center rounded-md p-0 text-base leading-none",
                      value === emoji &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    key={emoji}
                    onClick={() => select(emoji)}
                    size="sm"
                    title={emoji}
                    type="button"
                    variant="ghost"
                  >
                    {emoji}
                  </Button>
                ),
              )}
              {filteredIcons.map(([name, Icon]) => (
                <Button
                  aria-label={name}
                  aria-pressed={value === name}
                  className={cn(
                    "h-10 items-center justify-center rounded-md p-0",
                    value === name &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  key={name}
                  onClick={() => select(name)}
                  size="sm"
                  title={name}
                  type="button"
                  variant="ghost"
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default BoardIconPicker;
