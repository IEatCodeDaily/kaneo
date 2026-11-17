import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ToolbarButtonProps = Omit<ButtonProps, "children"> & {
  icon: ReactNode;
  label: string;
  badge?: string | number;
  applied?: boolean;
  iconOnly?: boolean;
};

/** One compact control; the toolbar's available width, not the viewport, hides labels. */
export function ToolbarButton({
  icon,
  label,
  badge,
  applied,
  iconOnly,
  variant = "ghost",
  className,
  ...props
}: ToolbarButtonProps) {
  return (
    <Button
      {...props}
      variant={variant}
      size="sm"
      aria-label={props["aria-label"] ?? label}
      title={props.title ?? label}
      data-toolbar-button=""
      data-applied={applied || undefined}
      className={cn(
        "h-7 gap-1.5 px-2 text-xs sm:h-7 pointer-coarse:text-xs",
        variant === "ghost" &&
          "border-border bg-background hover:bg-accent/60 data-popup-open:bg-secondary",
        applied &&
          "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft data-popup-open:bg-primary-soft data-popup-open:ring-1 data-popup-open:ring-input",
        className,
      )}
    >
      {icon}
      {!iconOnly && (
        <span data-toolbar-label="" className="hidden @3xl/toolbar:inline">
          {label}
          {badge !== undefined && (
            <span className="ms-1 rounded-sm bg-primary-soft px-1.5 text-xs tabular-nums">
              {badge}
            </span>
          )}
        </span>
      )}
    </Button>
  );
}
