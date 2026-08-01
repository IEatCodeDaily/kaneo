import { Check, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export type PrincipalPickerOption = {
  type: "user" | "team";
  value: string;
  label: string;
  image?: string;
};

type PrincipalPickerListProps = {
  options: PrincipalPickerOption[];
  /** Currently selected option, or null/undefined when nothing is chosen. */
  selected?: { type: "user" | "team"; value: string } | null;
  onSelect: (option?: PrincipalPickerOption) => void;
  loading?: boolean;
  /** Renders a leading "no selection" row (used by the assignee popover). */
  clearLabel?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: string;
  memberLabel?: string;
  teamLabel?: string;
};

/**
 * The compact member/team picker body: a search box over a flat list of people
 * and teams.
 *
 * #107: the flag dialog originally used the bulky `PrincipalSelector` combobox.
 * This is the assignment selector's list, extracted so both surfaces use one
 * control — "very compact and useful", and only one dropdown pattern to learn.
 */
export function PrincipalPickerList({
  options,
  selected,
  onSelect,
  loading = false,
  clearLabel,
  searchPlaceholder = "Search people and teams",
  searchAriaLabel = "Search people and teams",
  emptyMessage = "No people or teams found",
  memberLabel = "Member",
  teamLabel = "Team",
}: PrincipalPickerListProps) {
  const [search, setSearch] = useState("");

  const visibleOptions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase().includes(needle),
    );
  }, [options, search]);

  return (
    <>
      <div className="relative mb-1">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label={searchAriaLabel}
          className="h-8 pl-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          value={search}
        />
      </div>
      {/*
        #107: capped so the list scrolls instead of stretching its container.
        Sized for ~6 rows: tall enough to browse, short enough that a host with
        other controls (the flag popover stacks types, notes and actions around
        it) still fits on screen.
      */}
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {clearLabel ? (
          <Button
            className="w-full justify-start gap-2"
            onClick={() => onSelect()}
            size="sm"
            variant="ghost"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border">
              ?
            </span>
            {clearLabel}
            {!selected && <Check className="ml-auto h-4 w-4" />}
          </Button>
        ) : null}

        {loading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : (
          visibleOptions.map((option) => {
            const isSelected =
              selected?.type === option.type &&
              selected?.value === option.value;

            return (
              <Button
                className="w-full justify-start gap-2"
                data-testid={`principal-option-${option.type}-${option.value}`}
                key={`${option.type}:${option.value}`}
                onClick={() => onSelect(option)}
                size="sm"
                variant="ghost"
              >
                {option.type === "team" ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Users className="h-4 w-4" />
                  </span>
                ) : (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage alt={option.label} src={option.image} />
                    <AvatarFallback>{getInitials(option.label)}</AvatarFallback>
                  </Avatar>
                )}
                <span className="min-w-0 truncate">{option.label}</span>
                {/*
                  #107: the member/team kind is secondary information, so it is
                  pushed to the right edge instead of crowding the name it
                  follows. `ml-auto` on the kind means the check that used to
                  own that class now simply trails it.
                */}
                <span
                  className={cn(
                    "ml-auto shrink-0 text-xs text-muted-foreground",
                  )}
                  data-testid="principal-option-kind"
                >
                  {option.type === "team" ? teamLabel : memberLabel}
                </span>
                {isSelected && <Check className="h-4 w-4 shrink-0" />}
              </Button>
            );
          })
        )}

        {!loading && visibleOptions.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}

export default PrincipalPickerList;
