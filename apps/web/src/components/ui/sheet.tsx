"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type OverlayInset,
  overlayBody,
  overlayClose,
  overlayFooter,
  overlayHeader,
} from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import { i18n } from "@/lib/i18n";

const Sheet = SheetPrimitive.Root;

const SheetPortal = SheetPrimitive.Portal;

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetBackdrop({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="sheet-backdrop"
      {...props}
    />
  );
}

function SheetViewport({
  side,
  ...props
}: Omit<SheetPrimitive.Viewport.Props, "className"> & {
  side?: "right" | "left" | "top" | "bottom";
}) {
  return (
    <SheetPrimitive.Viewport
      data-slot="sheet-viewport"
      {...props}
      className={cn(
        "fixed inset-0 z-50 grid",
        side === "bottom" && "grid grid-rows-[1fr_auto] pt-12",
        side === "top" && "grid grid-rows-[auto_1fr] pb-12",
        side === "left" && "flex justify-start",
        side === "right" && "flex justify-end",
      )}
    />
  );
}

// sm: 480px row sheet. lg: the ticket drawer. fit: width comes from content.
const sheetSizes = {
  sm: "sm:max-w-120",
  lg: "sm:max-w-md md:max-w-xl lg:max-w-3xl",
  fit: "w-auto",
} as const;

// No `className`: width is `size`, padding is `inset` (see ui/overlay.ts).
function SheetPopup({
  children,
  showCloseButton = true,
  side = "right",
  size = "sm",
  inset = "default",
  ...props
}: Omit<SheetPrimitive.Popup.Props, "className"> & {
  showCloseButton?: boolean;
  side?: "right" | "left" | "top" | "bottom";
  size?: keyof typeof sheetSizes;
  inset?: OverlayInset;
}) {
  const horizontal = side === "left" || side === "right";
  return (
    <SheetPortal>
      <SheetBackdrop />
      <SheetViewport side={side}>
        <SheetPrimitive.Popup
          data-slot="sheet-popup"
          {...props}
          className={cn(
            "relative flex max-h-full min-h-0 w-full min-w-0 flex-col bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 transition-[opacity,translate] duration-200 ease-out will-change-transform data-ending-style:opacity-0 data-starting-style:opacity-0",
            side === "bottom" &&
              "row-start-2 rounded-t-lg border-t data-ending-style:translate-y-8 data-starting-style:translate-y-8",
            side === "top" &&
              "data-ending-style:-translate-y-8 data-starting-style:-translate-y-8 border-b",
            side === "left" &&
              "data-ending-style:-translate-x-8 data-starting-style:-translate-x-8 border-e",
            side === "right" &&
              "col-start-2 border-s data-ending-style:translate-x-8 data-starting-style:translate-x-8",
            horizontal && sheetSizes[size],
          )}
        >
          <div
            className={overlayBody}
            data-close={showCloseButton}
            data-inset={inset}
            data-slot="sheet-body"
          >
            {children}
          </div>
          {showCloseButton && (
            <SheetPrimitive.Close
              aria-label={i18n.t("common:actions.close")}
              className={overlayClose}
              data-slot="sheet-close"
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <XIcon />
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Popup>
      </SheetViewport>
    </SheetPortal>
  );
}

function SheetHeader({
  visuallyHidden = false,
  ...props
}: Omit<React.ComponentProps<"div">, "className"> & {
  /** Keep the title for assistive tech, draw no bar. */
  visuallyHidden?: boolean;
}) {
  return (
    <div
      data-slot="sheet-header"
      {...props}
      className={visuallyHidden ? "sr-only" : overlayHeader}
    />
  );
}

function SheetFooter(props: Omit<React.ComponentProps<"div">, "className">) {
  return <div data-slot="sheet-footer" {...props} className={overlayFooter} />;
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      className={cn("font-semibold text-sm leading-5", className)}
      data-slot="sheet-title"
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      className={cn("text-muted-foreground text-ui", className)}
      data-slot="sheet-description"
      {...props}
    />
  );
}

export {
  Sheet,
  SheetBackdrop,
  SheetBackdrop as SheetOverlay,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPopup,
  SheetPopup as SheetContent,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
